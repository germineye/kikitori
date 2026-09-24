import './style.css';
import { decodeAudio, MAX_BYTES } from './audio';
import { activeSentence, clock, type Sentence } from './segments';
import { loadTokenizer, rubyText } from './furigana';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<div class="shell">
  <header><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Kikitori — trang đầu"><span class="seal" lang="ja">聞</span><span>KIKITORI <small lang="ja">聞き取り</small></span></a></header>
  <main>
    <section class="source" aria-labelledby="source-title"><div class="section-label"><h2 id="source-title">01 <span>Mở bài nghe</span></h2><span>MP3 · WAV · M4A · OGG</span></div>
      <div id="dropzone" class="dropzone" role="button" tabindex="0" aria-label="Kéo thả file audio hoặc nhấn để chọn file"><span class="drop-icon" aria-hidden="true">↧</span><strong>Kéo thả file audio vào đây</strong><span>hoặc nhấn để chọn file trên máy</span></div>
      <input id="file" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" hidden/>
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
      <div id="empty"><span class="empty-mark" lang="ja">あ</span><p>Bài nghe của bạn bắt đầu ở đây.</p><span>Chọn hoặc kéo thả audio, rồi tạo transcript để nghe lại từng câu.</span></div>
      <div id="transcript"></div>
      <p id="transcript-note" class="transcript-note" hidden>Chạm hoặc nhấn Enter vào câu để nghe từ đó. Furigana hiện khi di chuột hoặc lấy nét; trên điện thoại có thể chọn Always. Mốc có dấu ≈ là thời gian ước lượng khi tách câu. AI có thể nghe hoặc đọc tên riêng sai.</p>
    </section>
  </main>
  <footer><span lang="ja">少しずつ、毎日。</span><span>Audio và transcript ở lại trên máy bạn.</span></footer>
</div>`;

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const audio=$<HTMLAudioElement>('audio');
const dropzone=$<HTMLDivElement>('dropzone');
const seek=$<HTMLInputElement>('seek');
const play=$<HTMLButtonElement>('play');
const transcribe=$<HTMLButtonElement>('transcribe');
let blob:Blob|undefined;let objectURL='';let sentences:Sentence[]=[];let worker:Worker|undefined;
let processing=false;let generation=0;let active=-1;
const rows=new Map<number,HTMLElement>();
function status(text:string){$('status').textContent=text;$('status').hidden=!text;}
function error(text:string){$('error').textContent=text;$('error').hidden=!text;}
function controls(){
  transcribe.disabled=processing||!blob;
  $('cancel').hidden=!processing;
}
function stop(){generation++;worker?.terminate();worker=undefined;processing=false;controls();}
function resetTranscript(){sentences=[];rows.clear();active=-1;$('transcript').replaceChildren();$('empty').hidden=false;$('transcript-note').hidden=true;$('sentence-count').textContent='';}
async function openBlob(next:Blob,name:string){
  if(next.size>MAX_BYTES||!next.size)throw new Error('Audio cần nhỏ hơn 100 MB và không được rỗng.');
  audio.pause();stop();resetTranscript();error('');status('');
  if(objectURL)URL.revokeObjectURL(objectURL);
  blob=next;objectURL=URL.createObjectURL(next);audio.src=objectURL;audio.playbackRate=Number($<HTMLInputElement>('speed').value);
  $('filename').textContent=name;$('workspace').hidden=false;seek.value='0';seek.max='1';$('duration').textContent='00:00';$('time').textContent='00:00';$('duration-label').textContent='';controls();
}
function validFile(file:File){return file.type.startsWith('audio/')||/\.(mp3|wav|m4a|ogg|flac|webm)$/i.test(file.name);}
async function loadFile(file:File){
  if(!validFile(file)){error('Chọn file audio MP3, WAV, M4A, OGG, FLAC hoặc WebM.');return;}
  try{await openBlob(file,file.name);}catch(err){error((err as Error).message);}
}
dropzone.addEventListener('click',()=>$<HTMLInputElement>('file').click());
dropzone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$<HTMLInputElement>('file').click();}});
$('file').addEventListener('change',async()=>{const input=$<HTMLInputElement>('file');const file=input.files?.[0];if(file)await loadFile(file);input.value='';});
let dragDepth=0;
dropzone.addEventListener('dragenter',event=>{event.preventDefault();dragDepth++;dropzone.classList.add('dragging');});
dropzone.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';});
dropzone.addEventListener('dragleave',event=>{event.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)dropzone.classList.remove('dragging');});
dropzone.addEventListener('drop',async event=>{event.preventDefault();dragDepth=0;dropzone.classList.remove('dragging');const files=event.dataTransfer?.files;if(!files?.length)return;if(files.length!==1){error('Chỉ chọn một file audio mỗi lần.');return;}await loadFile(files[0]);});
for(const name of ['dragover','drop'])window.addEventListener(name,event=>{if([...((event as DragEvent).dataTransfer?.types??[])].includes('Files'))event.preventDefault();});
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
controls();
