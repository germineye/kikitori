export type Chunk = { text: string; timestamp: [number | null, number | null] };
export type Sentence = { id: number; start: number; end: number; text: string; translation?: string; approximate: boolean };

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
    const parts = text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) ?? [text];
    let offset = 0;
    for (const part of parts) {
      const partStart = start + (end-start) * offset/text.length;
      offset += part.length;
      const partEnd = start + (end-start) * offset/text.length;
      if (pending && (partStart - pending.end > 1.2 || pending.text.length + part.length > 100)) {
        result.push(pending); pending = undefined;
      }
      if (!pending) pending = {id:0,start:partStart,end:partEnd,text:part,approximate:parts.length>1};
      else { pending.text += part; pending.end = partEnd; pending.approximate ||= parts.length>1; }
      if (/[。！？!?]$/u.test(part) || pending.text.length >= 100) { result.push(pending); pending=undefined; }
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
