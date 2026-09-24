export type Chunk = { text: string; timestamp: [number | null, number | null] };
export type Sentence = { id: number; start: number; end: number; text: string; approximate: boolean };

// Whisper segments may contain several sentences. Boundaries inside a segment are
// interpolated, never presented as word-aligned timestamps.
export function sentencesFromChunks(chunks: Chunk[], duration: number): Sentence[] {
  const result: Sentence[] = [];
  let pending: Sentence | undefined;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const text = chunk.text.trim();
    if (!text) continue;
    const start = Math.min(duration, Math.max(pending?.end ?? result.at(-1)?.end ?? 0, chunk.timestamp[0] ?? 0));
    const end = Math.min(duration, Math.max(start, chunk.timestamp[1] ?? chunks[i+1]?.timestamp[0] ?? duration));
    const punctuated = text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) ?? [text];
    // Listening exercises often omit punctuation before the next numbered item.
    // Split at a polite ending followed by whitespace/number, retaining all text.
    const parts = punctuated.flatMap(part => part.split(/(?<=(?:と思います|です|ます|ません|でした|でしょう)(?:か)?)(?=[\s\d０-９])/u).flatMap(fragment => fragment.split(/(?<=か)(?=(?:ええ|いいえ|いえ|はい))/u)));
    let offset = 0;
    for (const part of parts) {
      const partStart = start + (end-start) * offset/text.length;
      offset += part.length;
      const partEnd = start + (end-start) * offset/text.length;
      const gap = pending ? partStart - pending.end : 0;
      const exerciseLabel = pending && /^[\d０-９一二三四五六七八九十]+[。、.]?$/u.test(pending.text.trim());
      const nextExercise = pending && /(?:です|ます|ません|でした|でしょう)(?:か)?$/u.test(pending.text.trim()) && /^[\s\d０-９]/u.test(part);
      const answerAfterQuestion = pending && /(?:です|ます|ました|ません|でしょう)か$/u.test(pending.text.trim()) && /^(?:ええ|いいえ|いえ|はい)/u.test(part);
      if (pending && ((gap > 0.9 && !exerciseLabel) || pending.text.length + part.length > 100 || nextExercise || answerAfterQuestion)) {
        result.push(pending); pending = undefined;
      }
      if (!pending) pending = {id:0,start:partStart,end:partEnd,text:part,approximate:parts.length>1};
      else { pending.text += part; pending.end = partEnd; pending.approximate ||= parts.length>1; }
      if ((/[。！？!?]$/u.test(part) && !/^[\d０-９一二三四五六七八九十]+[。、.]?$/u.test(pending.text.trim())) || pending.text.length >= 100) { result.push(pending); pending=undefined; }
    }
  }
  if (pending) result.push(pending);
  return result.filter(s=>s.end>s.start).map((s,id)=>({...s,id,text:s.text.trim()}));
}

export function activeSentence(sentences: Sentence[], time: number): number {
  return sentences.findIndex(s=>time>=s.start && time<s.end);
}
export function clock(seconds: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;
}
