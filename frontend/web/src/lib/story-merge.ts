import lameUrl from 'lamejs/lame.all.js?url';

const FRAME = 1152;
type Encoder = { encodeBuffer(left: Int16Array, right: Int16Array): Uint8Array; flush(): Uint8Array };
type LameGlobal = Window & { lamejs?: { Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Encoder } };
let loading: Promise<void> | null = null;

function loadEncoder(): Promise<void> {
  if ((window as LameGlobal).lamejs) return Promise.resolve();
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = lameUrl;
    script.onload = () => (window as LameGlobal).lamejs ? resolve() : reject(new Error('Không tải được bộ gộp MP3.'));
    script.onerror = () => reject(new Error('Không tải được bộ gộp MP3.'));
    document.head.append(script);
  }).catch(error => { loading = null; throw error; });
  return loading!;
}

function pcm(source: Float32Array, start: number, length: number): Int16Array {
  const result = new Int16Array(FRAME);
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, source[start + i]));
    result[i] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  return result;
}

export async function mergeStoryMp3(urls: string[], fileName: string, onPart: (done: number) => void): Promise<void> {
  if (urls.length < 2) throw new Error('Cần ít nhất hai đoạn MP3 để gộp.');
  await loadEncoder();
  const context = new AudioContext();
  const encoder = new (window as LameGlobal).lamejs!.Mp3Encoder(2, context.sampleRate, 128);
  const output: Uint8Array[] = [];
  let totalSeconds = 0;
  try {
    for (let index = 0; index < urls.length; index++) {
      const response = await fetch(urls[index]);
      if (!response.ok) throw new Error(`Không tải được đoạn ${index + 1}; hãy làm mới tiến độ rồi thử lại.`);
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      totalSeconds += audio.duration;
      if (totalSeconds > 60 * 60) throw new Error('Chương dài hơn 60 phút; hãy tải từng đoạn để tránh đầy bộ nhớ.');
      const left = audio.getChannelData(0);
      const right = audio.getChannelData(Math.min(1, audio.numberOfChannels - 1));
      for (let start = 0; start < audio.length; start += FRAME) {
        const length = Math.min(FRAME, audio.length - start);
        const encoded = encoder.encodeBuffer(pcm(left, start, length), pcm(right, start, length));
        if (encoded.length) output.push(new Uint8Array(encoded));
      }
      onPart(index + 1);
    }
    const final = encoder.flush();
    if (final.length) output.push(new Uint8Array(final));
    const url = URL.createObjectURL(new Blob(output as BlobPart[], { type: 'audio/mpeg' }));
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally { await context.close(); }
}
