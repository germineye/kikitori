import './style.css';
import { decodeAudio, MAX_BYTES } from './audio';
import { activeSentence, clock, type Sentence } from './segments';
import { loadTokenizer, rubyText } from './furigana';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<div class="shell">
  <header><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Kikitori — trang đầu"><span class="seal" lang="ja">聞</span><span>KIKITORI <small lang="ja">聞き取り</small></span></a><span class="edition">聴解ノート <span> / 01</span></span></header>
  <main>
    <section class="intro"><p class="eyebrow">JAPANESE LISTENING NOTEBOOK</p><h1 lang="ja">一文ずつ、<br class="mobile-break">聞いてみよう。</h1><p>Nghe và đọc. Từng câu một.</p></section>
    <section class="source" aria-labelledby="source-title"><div class="section-label"><h2 id="source-title">01 <span>Mở bài nghe</span></h2><span>MP3 · WAV · M4A · OGG</span></div>
      <form id="drive-form"><label for="drive-url">Link Google Drive</label><div class="input-row"><input id="drive-url" type="url" placeholder="https://drive.google.com/file/d/…" required autocomplete="off" spellcheck="false"/><button class="primary" id="open-drive">Mở audio <span aria-hidden="true">↗</span></button></div></form>
      <div class="source-bottom"><p>File cần bật “Anyone with the link” và cho phép tải xuống.</p><span>hoặc <button id="choose-file" class="text-button">chọn file trên máy</button></span><input id="file" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" hidden/></div>
      <p class="limit">Tối đa 100 MB · 30 phút</p>
    </section>
    <section id="workspace" hidden aria-label="Bài nghe hiện tại">
      <div class="player"><div class="file-meta"><div><span class="eyebrow">ĐANG NGHE</span><h2 id="filename"></h2></div><span id="duration-label" class="mono"></span></div>
        <audio id="audio" preload="metadata"></audio>
        <div class="transport"><button id="play" class="play" aria-label="Phát audio">▶</button><span id="time" class="mono">00:00</span><input id="seek" aria-label="Vị trí audio" type="range" min="0" max="1" value="0" step="0.05"/><span id="duration" class="mono">00:00</span></div>
        <div class="player-bottom"><button class="text-button" id="back">↶ 5 giây</button><label for="speed">Tốc độ <input id="speed" type="range" min="0.5" max="1.5" step="0.05" value="1"/><output id="speed-value">1.00×</output></label></div>
      </div>
      <div class="process-row"><div><button id="transcribe" class="primary">Tạo transcript</button><button id="cancel" class="text-button" hidden>Dừng xử lý</button></div><p>Nhận dạng chạy trên máy bạn. Lần đầu cần tải model lớn;<br>nên dùng máy tính và giữ tab mở trong lúc xử lý.</p></div>
    </section>
    <div id="status" class="status" role="status" aria-live="polite" hidden></div>
    <div id="error" class="error" role="alert" hidden></div>
    <section class="transcript-section" aria-labelledby="transcript-title"><div class="section-label transcript-heading"><h2 id="transcript-title">02 <span>Bản nghe</span><small id="sentence-count"></small></h2><fieldset class="furigana"><legend>Furigana</legend><label><input type="radio" name="furigana" value="hover" checked/><span>Hover</span></label><label><input type="radio" name="furigana" value="always"/><span>Always</span></label></fieldset></div>
      <div id="empty"><span class="empty-mark" lang="ja">あ</span><p>Bài nghe của bạn bắt đầu ở đây.</p><span>Mở audio, rồi tạo transcript để nghe lại từng câu.</span></div>
      <div id="transcript"></div>
      <p id="transcript-note" class="transcript-note" hidden>Chạm hoặc nhấn Enter vào câu để nghe từ đó. Furigana hiện khi di chuột hoặc lấy nét; trên điện thoại có thể chọn Always. Mốc có dấu ≈ là thời gian ước lượng khi tách câu. AI có thể nghe hoặc đọc tên riêng sai.</p>
    </section>
  </main>
  <footer><span lang="ja">少しずつ、毎日。</span><span>Audio local ở lại trên máy · Audio Drive đi qua máy chủ chuyển tiếp, không lưu lại.</span></footer>
</div>`;

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const audio=$<HTMLAudioElement>('audio');
const driveInput=$<HTMLInputElement>('drive-url');
const seek=$<HTMLInputElement>('seek');
const play=$<HTMLButtonElement>('play');
const transcribe=$<HTMLButtonElement>('transcribe');
let blob:Blob|undefined;let objectURL='';let sentences:Sentence[]=[];let worker:Worker|undefined;
let loading=false;let processing=false;let generation=0;let active=-1;let pendingRequest:AbortController|undefined;
const rows=new Map<number,HTMLElement>();
function status(text:string){$('status').textContent=text;$('status').hidden=!text;}
function error(text:string){$('error').textContent=text;$('error').hidden=!text;}
function controls(){
  $<HTMLButtonElement>('open-drive').disabled=loading;
  $<HTMLButtonElement>('choose-file').disabled=loading;
  transcribe.disabled=loading||processing||!blob;
  $('cancel').hidden=!processing&&!loading;
}
function stop(){generation++;pendingRequest?.abort();pendingRequest=undefined;worker?.terminate();worker=undefined;processing=false;loading=false;controls();}
function resetTranscript(){sentences=[];rows.clear();active=-1;$('transcript').replaceChildren();$('empty').hidden=false;$('transcript-note').hidden=true;$('sentence-count').textContent='';}
async function openBlob(next:Blob,name:string){
  if(next.size>MAX_BYTES||!next.size)throw new Error('Audio cần nhỏ hơn 100 MB và không được rỗng.');
  audio.pause();stop();resetTranscript();error('');status('');
  if(objectURL)URL.revokeObjectURL(objectURL);
  blob=next;objectURL=URL.createObjectURL(next);audio.src=objectURL;audio.playbackRate=Number($<HTMLInputElement>('speed').value);
  $('filename').textContent=name;$('workspace').hidden=false;seek.value='0';seek.max='1';$('duration').textContent='00:00';$('time').textContent='00:00';$('duration-label').textContent='';controls();
}
$('drive-form').addEventListener('submit',async event=>{
  event.preventDefault();stop();error('');loading=true;controls();status('Đang mở audio từ Google Drive…');
  const run=generation;pendingRequest=new AbortController();
  try{
    const response=await fetch('/api/drive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:driveInput.value.trim()}),signal:pendingRequest.signal});
    if(!response.ok){const data=await response.json().catch(()=>({error:'Trang này chưa có máy chủ chuyển tiếp Google Drive. GitHub Pages chỉ chạy phần giao diện; cần triển khai server đi kèm để mở link Drive.'}));throw new Error(data.error);}
    const next=await response.blob();if(run!==generation)return;
    let name='Google Drive audio';try{name=decodeURIComponent(response.headers.get('x-audio-name')??name);}catch{/* fallback */}
    await openBlob(next,name);
  }catch(err){if(run===generation){status('');error(err instanceof Error?err.message:'Không mở được Drive.');}}
  finally{if(run===generation){loading=false;controls();}}
});
$('choose-file').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{const input=$<HTMLInputElement>('file');const file=input.files?.[0];if(file){try{await openBlob(file,file.name);}catch(err){error((err as Error).message);}}input.value='';});
$('cancel').addEventListener('click',()=>{stop();status('Đã dừng. Bạn vẫn có thể nghe audio và đọc những câu đã có.');});
play.addEventListener('click',async()=>{if(audio.paused){try{await audio.play();}catch{error('Không phát được audio. Hãy thử định dạng khác.');}}else audio.pause();});
audio.addEventListener('play',()=>{play.textContent='Ⅱ';play.setAttribute('aria-label','Tạm dừng audio');});
audio.addEventListener('pause',()=>{play.textContent='▶';play.setAttribute('aria-label','Phát audio');});
audio.addEventListener('error',()=>error('Trình duyệt không phát được file này. Hãy kiểm tra file hoặc dùng định dạng MP3/WAV.'));
audio.addEventListener('loadedmetadata',()=>{seek.max=String(Number.isFinite(audio.duration)?audio.duration:1);$('duration').textContent=clock(audio.duration);$('duration-label').textContent=clock(audio.duration);});
audio.addEventListener('timeupdate',()=>{seek.value=String(audio.currentTime);$('time').textContent=clock(audio.currentTime);highlight();});
seek.addEventListener('input',()=>{audio.currentTime=Number(seek.value);highlight();});
$('back').addEventListener('click',()=>{audio.currentTime=Math.max(0,audio.currentTime-5);});
$('speed').addEventListener('input',()=>{const value=Number($<HTMLInputElement>('speed').value);audio.playbackRate=value;$('speed-value').textContent=`${value.toFixed(2)}×`;});
document.querySelectorAll<HTMLInputElement>('[name=furigana]').forEach(input=>input.addEventListener('change',()=>{$('transcript').classList.toggle('always',input.value==='always');}));
function highlight(){const next=activeSentence(sentences,audio.currentTime);if(next===active)return;rows.get(active)?.removeAttribute('aria-current');active=next;rows.get(active)?.setAttribute('aria-current','true');}
async function renderSentences(run:number){
  $('empty').hidden=true;$('transcript-note').hidden=false;$('sentence-count').textContent=`${sentences.length} câu`;
  const fragment=document.createDocumentFragment();
  for(const sentence of sentences){
    const row=document.createElement('div');row.className='sentence';row.tabIndex=0;row.setAttribute('role','button');
    const time=document.createElement('span');time.className='timestamp';time.textContent=`${sentence.approximate?'≈ ':''}${clock(sentence.start)}`;
    const content=document.createElement('span');content.className='sentence-content';
    const japanese=document.createElement('span');japanese.className='japanese';japanese.lang='ja';japanese.textContent=sentence.text;
    content.append(japanese);row.append(time,content);
    const jump=async()=>{audio.currentTime=sentence.start;highlight();try{await audio.play();}catch{error('Nhấn nút phát để bắt đầu nghe.');}};
    row.addEventListener('click',()=>{const selection=window.getSelection();if(selection?.toString()&&selection.containsNode(row,true))return;void jump();});
    row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();void jump();}});
    rows.set(sentence.id,row);fragment.append(row);
  }
  $('transcript').replaceChildren(fragment);highlight();
  try{const tokenizer=await loadTokenizer();if(run!==generation)return;for(const sentence of sentences)rows.get(sentence.id)?.querySelector('.japanese')?.replaceChildren(rubyText(sentence.text,tokenizer));}
  catch(err){if(run===generation)error((err as Error).message);}
}
transcribe.addEventListener('click',async()=>{
  if(!blob||processing)return;stop();const run=generation;processing=true;controls();resetTranscript();error('');status('Đang chuẩn bị audio…');
  try{
    const decoded=await decodeAudio(blob);if(run!==generation)return;
    worker=new Worker(new URL('./inference.worker.ts',import.meta.url),{type:'module'});
    worker.onerror=()=>{if(run!==generation)return;stop();status('');error('Không khởi động được AI. Thử tải lại trang và kiểm tra bộ nhớ máy.');};
    worker.onmessage=event=>{
      if(run!==generation)return;const data=event.data;
      if(data.type==='status')status(data.message);
      if(data.type==='transcript'){sentences=data.sentences;void renderSentences(run);}
      if(data.type==='done'){processing=false;controls();status('Đã sẵn sàng. Chọn một câu để nghe lại.');worker?.terminate();worker=undefined;}
      if(data.type==='error'){processing=false;controls();status('');error(`Không hoàn tất xử lý: ${data.message}. Các câu đã nhận dạng vẫn ở bên dưới.`);worker?.terminate();worker=undefined;}
    };
    worker.postMessage(decoded,[decoded.samples.buffer]);
  }catch(err){if(run===generation){processing=false;controls();status('');error((err as Error).message);}}
});
window.addEventListener('pagehide',()=>{stop();if(objectURL)URL.revokeObjectURL(objectURL);});
