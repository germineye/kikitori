// Small public-file relay for the GitHub Pages frontend. No credentials or
// transcript data pass through this Worker; audio is streamed to the browser.
export const SITE_ORIGIN = 'https://germineye.github.io';
export const MAX_BYTES = 100 * 1024 * 1024;
const VALID_ID = /^[A-Za-z0-9_-]{10,200}$/;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

class DriveError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function parseDriveLink(input) {
  let url;
  try { url = new URL(input); } catch { throw new DriveError('Dán link chia sẻ file Google Drive hợp lệ.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || url.port) {
    throw new DriveError('Chỉ nhận link https://drive.google.com của một file audio.');
  }
  const pathId = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/view|\/preview)?\/?$/)?.[1];
  const id = pathId ?? (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null);
  const resourceKey = url.searchParams.get('resourcekey');
  if (!id || !VALID_ID.test(id)) throw new DriveError('Đây chưa phải link một file Drive.');
  if (resourceKey && !/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey)) throw new DriveError('Resource key trong link Drive không hợp lệ.');
  return { id, resourceKey };
}

function allowedDownloadURL(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (['drive.google.com', 'drive.usercontent.google.com', 'docs.google.com'].includes(url.hostname) || url.hostname.endsWith('.googleusercontent.com'));
}

function ascii(bytes, start, end) { return String.fromCharCode(...bytes.subarray(start, end)); }
function isAudio(bytes) {
  return ascii(bytes, 0, 3) === 'ID3' || ascii(bytes, 0, 4) === 'OggS' || ascii(bytes, 0, 4) === 'fLaC' ||
    (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') || ascii(bytes, 4, 8) === 'ftyp' ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3);
}

function decodeEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([a-f\d]+));/gi, (match, decimal, hex) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[match.toLowerCase()] ?? match;
  });
}
function attributes(tag) {
  const result = new Map();
  for (const match of tag.matchAll(/([a-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    result.set(match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4]));
  }
  return result;
}
function confirmationURL(html, currentURL, id) {
  for (const match of html.matchAll(/<form\b[^>]*>/gi)) {
    const form = attributes(match[0]);
    if (form.get('id') !== 'download-form') continue;
    const close = html.indexOf('</form>', match.index + match[0].length);
    if (close < 0) throw new DriveError('Trang xác nhận tải của Drive không hợp lệ.');
    const next = new URL(form.get('action') ?? '', currentURL);
    if (next.hostname !== 'drive.usercontent.google.com' || next.pathname !== '/download' || !allowedDownloadURL(next)) {
      throw new DriveError('Không nhận ra trang xác nhận tải của Drive.');
    }
    const body = html.slice(match.index + match[0].length, close);
    for (const input of body.matchAll(/<input\b[^>]*>/gi)) {
      const field = attributes(input[0]);
      const name = field.get('name');
      if (['id', 'export', 'confirm', 'uuid', 'resourcekey'].includes(name)) next.searchParams.set(name, field.get('value') ?? '');
    }
    if (next.searchParams.get('id') !== id) throw new DriveError('Drive trả về file khác với link đã nhập.');
    return next;
  }
  throw new DriveError('Không truy cập được audio. File cần bật “Anyone with the link” và cho phép tải xuống.');
}

async function readTextLimited(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw new DriveError('Trang xác nhận Drive quá lớn.', 502);
  const reader = response.body?.getReader();
  if (!reader) throw new DriveError('Drive trả về nội dung rỗng.', 502);
  const decoder = new TextDecoder();
  let text = '', total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new DriveError('Trang xác nhận Drive quá lớn.', 502); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function streamLimited(reader, first) {
  let total = 0, firstPending = first;
  return new ReadableStream({
    async pull(controller) {
      const result = firstPending ? { value: firstPending, done: false } : await reader.read();
      firstPending = null;
      if (result.done) { controller.close(); return; }
      total += result.value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        controller.error(new DriveError('File vượt quá giới hạn 100 MB.', 413));
        return;
      }
      controller.enqueue(result.value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

function fileName(disposition) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) { try { return decodeURIComponent(encoded).slice(0, 200); } catch { /* fallback */ } }
  return (disposition.match(/filename="([^"\r\n]+)"/)?.[1] ?? 'Google Drive audio').slice(0, 200);
}

export async function downloadPublicDrive(input, fetchImpl = fetch) {
  const { id, resourceKey } = parseDriveLink(input);
  let url = new URL('https://drive.google.com/uc');
  url.searchParams.set('export', 'download');
  url.searchParams.set('id', id);
  if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
  let confirmed = false;
  for (let step = 0; step < 7; step++) {
    if (!allowedDownloadURL(url)) throw new DriveError('Drive chuyển hướng ra ngoài máy chủ tải file được cho phép.', 502);
    const response = await fetchImpl(url, { redirect: 'manual', headers: { Accept: '*/*' } });
    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new DriveError('Drive không trả về địa chỉ tải file.', 502);
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new DriveError(response.status === 429 ? 'Drive đang giới hạn lượt tải. Hãy thử lại sau.' : 'Không mở được file. Kiểm tra quyền chia sẻ và cho phép tải xuống.', 502);
    }
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('text/html')) {
      const html = await readTextLimited(response, 1024 * 1024);
      if (confirmed) throw new DriveError('Drive chưa cho phép tải file sau xác nhận.', 502);
      url = confirmationURL(html, url, id);
      confirmed = true;
      continue;
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw new DriveError('File vượt quá giới hạn 100 MB.', 413);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new DriveError('Drive trả về file rỗng.', 502);
    const pieces = [];
    let prefixLength = 0;
    while (prefixLength < 12) {
      const part = await reader.read();
      if (part.done) break;
      pieces.push(part.value);
      prefixLength += part.value.byteLength;
      if (prefixLength > MAX_BYTES) break;
    }
    const prefix = new Uint8Array(prefixLength);
    let offset = 0;
    for (const part of pieces) { prefix.set(part, offset); offset += part.byteLength; }
    if (!isAudio(prefix)) {
      await reader.cancel();
      throw new DriveError('File Drive này không phải định dạng audio được hỗ trợ.', 400);
    }
    return {
      body: streamLimited(reader, prefix),
      type: /^(audio|video)\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream',
      name: fileName(response.headers.get('content-disposition') ?? ''),
      length: response.headers.get('content-length'),
    };
  }
  throw new DriveError('Drive chuyển hướng quá nhiều lần.', 502);
}

const cors = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-Audio-Name',
  Vary: 'Origin',
};
function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function handleRequest(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/drive') return new Response('Not found', { status: 404 });
  if (request.headers.get('Origin') !== SITE_ORIGIN) return new Response('Forbidden', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return jsonError('Chỉ hỗ trợ POST.', 405);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return jsonError('Yêu cầu JSON.', 415);
  if (Number(request.headers.get('Content-Length')) > 4096) return jsonError('Link quá dài.', 413);
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new DriveError('Link quá dài.', 413);
    let data;
    try { data = JSON.parse(raw); } catch { throw new DriveError('Yêu cầu không hợp lệ.'); }
    if (typeof data.url !== 'string') throw new DriveError('Thiếu link Google Drive.');
    const audio = await downloadPublicDrive(data.url, fetchImpl);
    const headers = { ...cors, 'Content-Type': audio.type, 'X-Audio-Name': encodeURIComponent(audio.name), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (audio.length) headers['Content-Length'] = audio.length;
    return new Response(audio.body, { status: 200, headers });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không mở được Drive.', error instanceof DriveError ? error.status : 502);
  }
}

export default { fetch: handleRequest };
