import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentencesFromChunks, activeSentence, clock } from '../src/segments.ts';
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
