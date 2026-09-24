import { env, pipeline } from '@huggingface/transformers';
import { sentencesFromChunks, type Chunk } from './segments';
env.allowLocalModels=false;
// WASM q8 is deliberately the baseline: no WebGPU requirement, consistent NLLB
// output across devices. The worker keeps inference off the playback/UI thread.
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
    const transcriber=await pipeline('automatic-speech-recognition','Xenova/whisper-base',{device:'wasm',dtype:'q8',progress_callback:progress('Tải bộ nhận dạng')});
    let chunks: Chunk[]=[];
    try {
      status('Đang nghe và chép tiếng Nhật… Có thể mất vài phút.');
      const output=await transcriber(event.data.samples,{language:'japanese',task:'transcribe',return_timestamps:true,chunk_length_s:30,stride_length_s:5});
      const result=Array.isArray(output)?output[0]:output;
      chunks=(result.chunks??[]) as Chunk[];
    } finally { await transcriber.dispose(); }
    const sentences=sentencesFromChunks(chunks,event.data.duration);
    if(!sentences.length)throw new Error('Không nhận ra lời nói. Hãy kiểm tra lại audio và thử lần nữa.');
    self.postMessage({type:'transcript',sentences});
    status('Đang tải bộ dịch Nhật → Việt…');
    const translator=await pipeline('translation','Xenova/nllb-200-distilled-600M',{device:'wasm',dtype:'q8',progress_callback:progress('Tải bộ dịch')});
    try {
      for(const sentence of sentences){
        status(`Đang dịch câu ${sentence.id+1}/${sentences.length}…`);
        // TranslationPipeline accepts language codes at runtime; v3's inherited
        // GenerationConfig type does not declare these tokenizer options.
        const translationOptions={src_lang:'jpn_Jpan',tgt_lang:'vie_Latn',max_new_tokens:256};
        const output=await translator(sentence.text,translationOptions as unknown as Parameters<typeof translator>[1]);
        const first=output[0];
        const translated=Array.isArray(first)?first[0]:first;
        self.postMessage({type:'translation',id:sentence.id,text:translated.translation_text});
      }
    } finally { await translator.dispose(); }
    self.postMessage({type:'done'});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
  finally{busy=false;}
};
