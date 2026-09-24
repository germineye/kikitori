export const MAX_BYTES = 100 * 1024 * 1024;
const VALID_ID = /^[A-Za-z0-9_-]{10,200}$/;
export function parseDriveLink(input) {
  let url; try {url=new URL(input);}catch{throw new Error('Dán link chia sẻ file Google Drive hợp lệ.');}
  if(url.protocol!=='https:' || url.hostname!=='drive.google.com' || url.username || url.password || url.port)throw new Error('Chỉ nhận link https://drive.google.com của một file audio.');
  const pathId=url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/view|\/preview)?\/?$/)?.[1];
  const id=pathId ?? (['/open','/uc'].includes(url.pathname)?url.searchParams.get('id'):null);
  const resourceKey=url.searchParams.get('resourcekey');
  if(!id || !VALID_ID.test(id))throw new Error('Đây chưa phải link một file Drive. Link thư mục và Google Forms không được hỗ trợ.');
  if(resourceKey && !/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey))throw new Error('Resource key trong link Drive không hợp lệ.');
  return {id,resourceKey};
}
export function allowedDownloadURL(url) {
  return url.protocol==='https:' && !url.username && !url.password && !url.port &&
    (['drive.google.com','drive.usercontent.google.com','docs.google.com'].includes(url.hostname) || url.hostname.endsWith('.googleusercontent.com'));
}
async function limitedBytes(response,limit) {
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('File vượt quá giới hạn 100 MB.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Drive trả về file rỗng.');
  const chunks=[];let total=0;
  try { while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit)throw new Error('File vượt quá giới hạn cho phép.');chunks.push(value);} }
  finally {await reader.cancel();}
  return Buffer.concat(chunks,total);
}
export function isAudio(bytes) {
  const ascii=bytes.subarray(0,12).toString('ascii');
  return ascii.startsWith('ID3') || ascii.startsWith('OggS') || ascii.startsWith('fLaC') ||
    (ascii.startsWith('RIFF') && ascii.endsWith('WAVE')) || ascii.slice(4,8)==='ftyp' ||
    (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0) || (bytes[0]===0x1a && bytes[1]===0x45 && bytes[2]===0xdf && bytes[3]===0xa3);
}
export async function downloadDrive(input,{fetchImpl=fetch,signal}={}) {
  const {id,resourceKey}=parseDriveLink(input);
  let url=new URL('https://drive.google.com/uc');url.searchParams.set('export','download');url.searchParams.set('id',id);
  if(resourceKey)url.searchParams.set('resourcekey',resourceKey);
  let confirmation=false;
  for(let step=0;step<7;step++){
    if(!allowedDownloadURL(url))throw new Error('Drive chuyển hướng ra ngoài máy chủ tải file được cho phép.');
    const response=await fetchImpl(url,{redirect:'manual',signal,headers:{Accept:'*/*'}});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');await response.body?.cancel();
      if(!location)throw new Error('Drive không trả về địa chỉ tải file.');
      url=new URL(location,url);continue;
    }
    if(!response.ok){await response.body?.cancel();throw new Error(response.status===429?'Drive đang giới hạn lượt tải. Hãy thử lại sau.':'Không mở được file. Kiểm tra quyền “Anyone with the link” và cho phép tải xuống.');}
    const type=response.headers.get('content-type')??'';
    const bytes=await limitedBytes(response,type.includes('text/html')?1024*1024:MAX_BYTES);
    if(type.includes('text/html') || bytes.subarray(0,100).toString().trimStart().startsWith('<')){
      if(confirmation)throw new Error('Drive chưa cho phép tải file. Kiểm tra quyền chia sẻ hoặc giới hạn lượt tải.');
      // Only Google's explicit download form is followed; no arbitrary links,
      // scripts, cookies, credentials, or user-provided proxy targets.
      const {parseHTML}=await import('linkedom');
      const {document}=parseHTML(bytes.toString());const form=document.querySelector('form#download-form');
      if(!form)throw new Error('Không truy cập được audio. Giáo viên cần bật “Anyone with the link” và cho phép tải xuống.');
      const next=new URL(form.getAttribute('action')??'',url);
      if(next.hostname!=='drive.usercontent.google.com' || next.pathname!=='/download' || !allowedDownloadURL(next))throw new Error('Không nhận ra trang xác nhận tải của Drive.');
      for(const field of form.querySelectorAll('input[name]')){const name=field.getAttribute('name');if(['id','export','confirm','uuid','resourcekey'].includes(name))next.searchParams.set(name,field.getAttribute('value')??'');}
      if(next.searchParams.get('id')!==id)throw new Error('Drive trả về file khác với link đã nhập.');
      url=next;confirmation=true;continue;
    }
    if(!isAudio(bytes))throw new Error('File Drive này không phải định dạng audio được hỗ trợ.');
    const disposition=response.headers.get('content-disposition')??'';
    let name=disposition.match(/filename="([^"\r\n]+)"/)?.[1]??'Google Drive audio';
    const encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if(encoded){try{name=decodeURIComponent(encoded);}catch{/* use safe fallback */}}
    return {bytes,type:/^(audio|video)\/[\w.+-]+$/.test(type)?type:'application/octet-stream',name:name.slice(0,200)};
  }
  throw new Error('Drive chuyển hướng quá nhiều lần. Hãy thử lại sau.');
}
