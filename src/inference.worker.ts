import { env, pipeline } from '@huggingface/transformers';
import { sentencesFromChunks, type Chunk } from './segments';
env.allowLocalModels=false;
// Keep inference off the playback/UI thread. Quantized Whisper Small improves
// recognition over the previous Base model while remaining usable on CPU.
env.backends.onnx.wasm!.numThreads=1;
let busy=false;
self.onmessage=async(event:MessageEvent<{samples:Float32Array;duration:number}>)=>{
  if(busy)return; busy=true;
  const status=(message:string)=>self.postMessage({type:'status',message});
  const progress=(label:string)=>(p: {status:string;progress?:number})=>{
    if(p.status==='progress') status(`${label} · ${Math.round(p.progress??0)}% của tệp hiện tại`);
  };
  try {
    status('Đang tải bộ nhận dạng tiếng Nhật…');
    const transcriber=await pipeline('automatic-speech-recognition','onnx-community/whisper-small_timestamped',{device:'wasm',dtype:'q8',progress_callback:progress('Tải bộ nhận dạng')});
    let chunks: Chunk[]=[];
    try {
      status('Đang nghe và chép tiếng Nhật… Có thể mất vài phút.');
      const output=await transcriber(event.data.samples,{language:'japanese',task:'transcribe',return_timestamps:'word',chunk_length_s:30,stride_length_s:5});
      const result=Array.isArray(output)?output[0]:output;
      chunks=(result.chunks??[]) as Chunk[];
    } finally { await transcriber.dispose(); }
    const sentences=sentencesFromChunks(chunks,event.data.duration);
    if(!sentences.length)throw new Error('Không nhận ra lời nói. Hãy kiểm tra lại audio và thử lần nữa.');
    self.postMessage({type:'transcript',sentences});
    self.postMessage({type:'done'});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
  finally{busy=false;}
};
