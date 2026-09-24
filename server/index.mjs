import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { downloadDrive } from './drive.mjs';

const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.gz':'application/octet-stream','.json':'application/json'};
let inflight=0;
const visits=new Map();
function sendError(res,status,message){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({error:message}));}
export const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const url=new URL(req.url??'/','http://localhost');
  if(url.pathname==='/api/drive'){
    if(req.method!=='POST'){sendError(res,405,'Chỉ hỗ trợ POST.');return;}
    // Refuse cross-site browser use. No CORS headers or arbitrary URL forwarding.
    if(req.headers['sec-fetch-site']==='cross-site'){sendError(res,403,'Chỉ mở Drive từ trang Kikitori.');return;}
    if(!(req.headers['content-type']??'').startsWith('application/json')){sendError(res,415,'Yêu cầu JSON.');return;}
    const now=Date.now();for(const [key,value] of visits)if(value.until<now)visits.delete(key);
    const ip=req.socket.remoteAddress??'unknown';const usage=visits.get(ip)??{count:0,until:now+60000};
    if(usage.count>=10 || inflight>=3){sendError(res,429,'Đang có nhiều lượt tải. Hãy thử lại sau một phút.');return;}
    usage.count++;visits.set(ip,usage);inflight++;
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
    res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    try{
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw new Error('Link quá dài.');}
      let data;try{data=JSON.parse(body);}catch{throw new Error('Yêu cầu không hợp lệ.');}
      if(typeof data.url!=='string')throw new Error('Thiếu link Google Drive.');
      const file=await downloadDrive(data.url,{signal:controller.signal});
      res.writeHead(200,{'content-type':file.type,'content-length':file.bytes.length,'cache-control':'no-store','x-audio-name':encodeURIComponent(file.name)});res.end(file.bytes);
    }catch(error){if(!res.destroyed)sendError(res,controller.signal.aborted?504:400,controller.signal.aborted?'Drive phản hồi quá lâu. Hãy thử lại.':error.message);}
    finally{clearTimeout(timer);inflight--;}
    return;
  }
  if(!['GET','HEAD'].includes(req.method??'')){sendError(res,405,'Phương thức không được hỗ trợ.');return;}
  let path;try{path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{sendError(res,400,'Đường dẫn không hợp lệ.');return;}
  if(!path.startsWith(root+sep)){sendError(res,403,'Không được phép.');return;}
  try{const content=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);}
  catch{sendError(res,404,'Chưa tìm thấy trang. Chạy pnpm build trước khi pnpm start.');}
});
server.listen(Number(process.env.PORT??8787),process.env.HOST??'127.0.0.1',()=>console.log(`Kikitori listening on port ${process.env.PORT??8787}`));
