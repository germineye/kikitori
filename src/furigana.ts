type Token = { surface_form: string; reading?: string };
type Tokenizer = { tokenize(text: string): Token[] };
declare global { interface Window { kuromoji: { builder(options: {dicPath:string}): {build(callback:(err:Error|null,tokenizer:Tokenizer)=>void):void} } } }
let ready: Promise<Tokenizer> | undefined;
export function loadTokenizer(): Promise<Tokenizer> {
  return ready ??= new Promise<Tokenizer>((resolve,reject)=>{
    const script = document.createElement('script'); script.src='/vendor/kuromoji.js';
    script.onerror=()=>reject(new Error('Không tải được từ điển furigana. Hãy thử lại.'));
    script.onload=()=>window.kuromoji.builder({dicPath:'/vendor/dict/'}).build((err,tokenizer)=>err?reject(err):resolve(tokenizer));
    document.head.append(script);
  }).catch(err=>{ ready=undefined; throw err; });
}
export function rubyText(text: string, tokenizer: Tokenizer): DocumentFragment {
  const fragment=document.createDocumentFragment();
  for (const token of tokenizer.tokenize(text)) {
    if (!/[\u3400-\u9fff々]/u.test(token.surface_form) || !token.reading || token.reading==='*') { fragment.append(token.surface_form); continue; }
    const ruby=document.createElement('ruby'); ruby.append(token.surface_form);
    const rt=document.createElement('rt'); rt.textContent=token.reading.replace(/[ァ-ヶ]/gu,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
    ruby.append(rt); fragment.append(ruby);
  }
  return fragment;
}
