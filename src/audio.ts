export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_SECONDS = 30 * 60;
export async function decodeAudio(blob: Blob): Promise<{samples:Float32Array<ArrayBuffer>;duration:number}> {
  if (!blob.size || blob.size>MAX_BYTES) throw new Error('Chọn audio có dung lượng từ 1 byte đến 100 MB.');
  const context=new AudioContext();
  try {
    const audio=await context.decodeAudioData(await blob.arrayBuffer());
    if(audio.duration>MAX_SECONDS) throw new Error('V1 hỗ trợ bài nghe dài tối đa 30 phút.');
    const offline=new OfflineAudioContext(1,Math.ceil(audio.duration*16000),16000);
    const source=offline.createBufferSource();source.buffer=audio;source.connect(offline.destination);source.start();
    const mono=await offline.startRendering();
    return {samples:mono.getChannelData(0).slice(),duration:audio.duration};
  } catch (error) {
    if(error instanceof DOMException) throw new Error('Trình duyệt không đọc được audio này. Hãy dùng MP3, WAV, M4A hoặc OGG được hỗ trợ.');
    throw error;
  } finally { await context.close(); }
}
