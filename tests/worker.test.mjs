import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, MAX_BYTES, SITE_ORIGIN } from '../worker/index.mjs';

const id = '1DPnG6t-ixHZsTia2Vix29-RxK8isiNNE';
const link = `https://drive.google.com/file/d/${id}/view`;
const mp3 = Buffer.from('ID3\x04\x00\x00sample audio');
function browserRequest(url = link, origin = SITE_ORIGIN) {
  return new Request('https://kikitori-drive.example/api/drive', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

test('Pages can open a public Drive MP3 through the streaming Worker', async () => {
  let calls = 0;
  const response = await handleRequest(browserRequest(), async url => {
    if (++calls === 1) return new Response(null, { status: 302, headers: { Location: `https://drive.usercontent.google.com/download?id=${id}` } });
    assert.equal(url.hostname, 'drive.usercontent.google.com');
    return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Disposition': 'attachment; filename="lesson.mp3"' } });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE_ORIGIN);
  assert.equal(decodeURIComponent(response.headers.get('X-Audio-Name')), 'lesson.mp3');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp3);
  assert.equal(calls, 2);
});

test('Worker accepts the browser preflight from GitHub Pages', async () => {
  const request = new Request('https://kikitori-drive.example/api/drive', {
    method: 'OPTIONS',
    headers: { Origin: SITE_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  const response = await handleRequest(request);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE_ORIGIN);
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /Content-Type/i);
});

test('Worker follows only the expected Google confirmation form', async () => {
  let calls = 0;
  const response = await handleRequest(browserRequest(), async url => {
    if (++calls === 1) return new Response(`<form id="download-form" action="https://drive.usercontent.google.com/download"><input name="id" value="${id}"><input name="confirm" value="t"></form>`, { headers: { 'Content-Type': 'text/html' } });
    assert.equal(url.searchParams.get('id'), id);
    assert.equal(url.searchParams.get('confirm'), 't');
    return new Response(mp3);
  });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp3);
});

test('Worker rejects cross-origin use, unsafe redirects and oversized files', async () => {
  let called = false;
  const crossOrigin = await handleRequest(browserRequest(link, 'https://evil.example'), async () => { called = true; });
  assert.equal(crossOrigin.status, 403);
  assert.equal(called, false);
  const redirected = await handleRequest(browserRequest(), async () => new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/secrets' } }));
  assert.equal(redirected.status, 502);
  const oversized = await handleRequest(browserRequest(), async () => new Response(mp3, { headers: { 'Content-Length': String(MAX_BYTES + 1) } }));
  assert.equal(oversized.status, 413);
});

