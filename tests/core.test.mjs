import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentencesFromChunks, activeSentence, clock } from '../src/segments.ts';
import { parseDriveLink, allowedDownloadURL, downloadDrive, isAudio, MAX_BYTES } from '../server/drive.mjs';
const id='0123456789abcdefghijk';
const link=`https://drive.google.com/file/d/${id}/view`;
const mp3=Buffer.from('ID3\x04\x00\x00sample audio');

test('Drive view/open/uc links and resource keys',()=>{
  assert.deepEqual(parseDriveLink(`${link}?resourcekey=0-abc`),{id,resourceKey:'0-abc'});
  assert.equal(parseDriveLink(`https://drive.google.com/open?id=${id}`).id,id);
  assert.equal(parseDriveLink(`https://drive.google.com/uc?id=${id}&export=download`).id,id);
});
test('reject folders, Forms, impostor domains, credentials and non-HTTPS',()=>{
  for(const url of ['https://docs.google.com/forms/d/test/viewform',`https://drive.google.com/drive/folders/${id}`,`https://drive.google.com.evil.test/file/d/${id}/view`,`http://drive.google.com/file/d/${id}/view`,`https://user:pass@drive.google.com/file/d/${id}/view`,'not a link'])assert.throws(()=>parseDriveLink(url));
});
test('redirect allowlist rejects local networks and lookalike hosts',()=>{
  for(const host of ['127.0.0.1','localhost','169.254.169.254','drive.google.com.evil.test','googleusercontent.com.evil.test'])assert.equal(allowedDownloadURL(new URL(`https://${host}/`)),false);
  assert.equal(allowedDownloadURL(new URL('https://drive.usercontent.google.com/download')),true);
  assert.equal(allowedDownloadURL(new URL('https://drive.usercontent.google.com:444/download')),false);
});
test('downloads audio and preserves resource key without storing it',async()=>{
  const result=await downloadDrive(`${link}?resourcekey=0-abc`,{fetchImpl:async(url,options)=>{
    assert.equal(url.searchParams.get('resourcekey'),'0-abc');assert.equal(options.redirect,'manual');
    return new Response(mp3,{headers:{'content-type':'audio/mpeg','content-disposition':'attachment; filename="lesson.mp3"'}});
  }});assert.equal(result.name,'lesson.mp3');assert.deepEqual(result.bytes,mp3);
});
test('follows Google download redirect but not a private-network redirect',async()=>{
  let count=0;
  const result=await downloadDrive(link,{fetchImpl:async()=>++count===1?new Response(null,{status:302,headers:{location:`https://drive.usercontent.google.com/download?id=${id}`}}):new Response(mp3)});
  assert.deepEqual(result.bytes,mp3);assert.equal(count,2);
  await assert.rejects(downloadDrive(link,{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/secrets'}})}),/chuyển hướng/);
});
test('handles permission errors, rate limits and non-audio responses',async()=>{
  await assert.rejects(downloadDrive(link,{fetchImpl:async()=>new Response('',{status:403})}),/Anyone with the link/);
  await assert.rejects(downloadDrive(link,{fetchImpl:async()=>new Response('',{status:429})}),/giới hạn/);
  await assert.rejects(downloadDrive(link,{fetchImpl:async()=>new Response('not audio')}),/không phải/);
});
test('rejects oversized Content-Length before allocating the body',async()=>{
  await assert.rejects(downloadDrive(link,{fetchImpl:async()=>new Response(mp3,{headers:{'content-length':String(MAX_BYTES+1)}})}),/100 MB/);
});
test('checks audio signatures, not just a supplied MIME type',()=>{
  assert.equal(isAudio(mp3),true);assert.equal(isAudio(Buffer.from('<html>login</html>')),false);
  assert.equal(isAudio(Buffer.from('RIFF1234WAVE')),true);assert.equal(isAudio(Buffer.from('RIFF1234FAKE')),false);
});
test('sentence split retains punctuation and identifies interpolated boundaries',()=>{
  const out=sentencesFromChunks([{text:'明日は晴れです。出かけましょう。',timestamp:[0,8]}],10);
  assert.equal(out.length,2);assert.equal(out[0].text,'明日は晴れです。');assert.equal(out[1].end,8);
  assert.equal(out[0].end,out[1].start);assert.ok(out.every(s=>s.approximate));
});
test('joins fragmented sentences, preserves meaningful pauses',()=>{
  const out=sentencesFromChunks([{text:'明日は',timestamp:[1,2]},{text:'休みです。',timestamp:[2,4]},{text:'はい',timestamp:[7,8]}],8);
  assert.equal(out.length,2);assert.equal(out[0].text,'明日は休みです。');assert.equal(out[1].start,7);
});
test('clamps missing/out-of-range timestamps and does not highlight silence',()=>{
  const out=sentencesFromChunks([{text:'はい。',timestamp:[2,3]},{text:'そうです。',timestamp:[5,null]}],7);
  assert.equal(out[1].end,7);assert.equal(activeSentence(out,4),-1);assert.equal(activeSentence(out,2),0);assert.equal(activeSentence(out,7),-1);
  assert.deepEqual(sentencesFromChunks([{text:'',timestamp:[0,1]}],1),[]);
});
test('clock handles invalid and long durations',()=>{assert.equal(clock(NaN),'00:00');assert.equal(clock(-1),'00:00');assert.equal(clock(3661),'61:01');});
test('unpunctuated polite answers do not swallow the next numbered exercise',()=>{
  const out=sentencesFromChunks([{text:'大丈夫だと思います',timestamp:[0,3]},{text:'2 次は何ですか',timestamp:[4,7]}],7);
  assert.equal(out.length,2);assert.equal(out[0].text,'大丈夫だと思います');
  const inside=sentencesFromChunks([{text:'そう思います3 次の問題です',timestamp:[0,6]}],6);
  assert.equal(inside.length,2);assert.equal(inside[0].text,'そう思います');assert.ok(inside.every(s=>s.approximate));
});
test('word timestamps place sentence starts at spoken word boundaries',()=>{
  const out=sentencesFromChunks([
    {text:'昨日は',timestamp:[1,1.7]},
    {text:'晴れでした。',timestamp:[1.7,2.6]},
    {text:'二番、',timestamp:[3.3,3.8]},
    {text:'図書館へ行きます。',timestamp:[3.8,5.1]}
  ],6);
  assert.equal(out.length,2);
  assert.deepEqual(out.map(s=>s.start),[1,3.3]);
  assert.ok(out.every(s=>!s.approximate));
});
test('question-ending ka and numbered prompt stay with their spoken sentence',()=>{
  const out=sentencesFromChunks([
    {text:'今日来ます',timestamp:[0,2]},
    {text:'か?',timestamp:[2,2.5]},
    {text:'6。',timestamp:[5,5.4]},
    {text:'図書館は開いていますか?',timestamp:[5.8,9]}
  ],10);
  assert.equal(out.length,2);
  assert.equal(out[0].text,'今日来ますか?');
  assert.equal(out[1].text,'6。図書館は開いていますか?');
});
test('unpunctuated question and answer become separate listening units',()=>{
  const together=sentencesFromChunks([{text:'今日は休みですかええ休みだと思います',timestamp:[0,8]}],8);
  assert.deepEqual(together.map(s=>s.text),['今日は休みですか','ええ休みだと思います']);
  const words=sentencesFromChunks([{text:'教室にいますか',timestamp:[0,3]},{text:'いえいないと思います',timestamp:[3,6]}],6);
  assert.deepEqual(words.map(s=>s.text),['教室にいますか','いえいないと思います']);
});

let hasParser=true;try{await import('linkedom');}catch{hasParser=false;}
test('Drive confirmation form keeps original file and rejects substituted IDs',{skip:!hasParser&&'Install dependencies to run HTML confirmation tests'},async()=>{
  const html=`<form id="download-form" action="https://drive.usercontent.google.com/download"><input name="id" value="${id}"><input name="confirm" value="t"></form>`;
  let count=0;const out=await downloadDrive(link,{fetchImpl:async(url)=>{
    if(++count===1)return new Response(html,{headers:{'content-type':'text/html'}});
    assert.equal(url.searchParams.get('confirm'),'t');return new Response(mp3);
  }});assert.deepEqual(out.bytes,mp3);
  await assert.rejects(downloadDrive(link,{fetchImpl:async()=>new Response(html.replace(id,'different-file-id'),{headers:{'content-type':'text/html'}})}),/file khác/);
});
