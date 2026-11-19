import { inspectReferenceWav } from '../../../shared/voice-clone';

const MAX_BYTES = 10 * 1024 * 1024;
const TARGET_RATE = 16_000;
const MAX_SECONDS = 60;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
}

function fileDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file), player = new Audio();
    const finish = (duration?: number) => {
      window.clearTimeout(timer); player.onloadedmetadata = null; player.onerror = null;
      player.removeAttribute('src'); player.load(); URL.revokeObjectURL(url);
      resolve(duration ?? null);
    };
    const timer = window.setTimeout(() => finish(), 10_000);
    player.preload = 'metadata';
    player.onloadedmetadata = () => finish(Number.isFinite(player.duration) ? player.duration : undefined);
    player.onerror = () => finish();
    player.src = url;
    player.load();
  });
}

function encodeMonoWav(audio: AudioBuffer) {
  const count = audio.length, bytes = new Uint8Array(44 + count * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, TARGET_RATE, true); view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeAscii(view, 36, 'data');
  view.setUint32(40, count * 2, true);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
  for (let index = 0; index < count; index++) {
    const value = channels.reduce((sum, channel) => sum + channel[index], 0) / channels.length;
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export async function prepareVoiceSample(file: File) {
  if (file.size > MAX_BYTES) throw new Error('Tệp âm thanh tối đa 10 MiB.');
  if (!/\.(mp3|wav)$/i.test(file.name)) throw new Error('Chọn tệp MP3 hoặc WAV.');
  const duration = await fileDuration(file);
  if (duration !== null && duration < 3) throw new Error('Tệp âm thanh cần dài ít nhất 3 giây.');
  if (duration !== null && duration > MAX_SECONDS) throw new Error('Tệp âm thanh vượt quá thời lượng tối đa 60 giây.');
  const Context = window.OfflineAudioContext;
  if (!Context) throw new Error('Trình duyệt này chưa hỗ trợ đọc tệp âm thanh.');
  try {
    const context = new Context(1, 1, TARGET_RATE);
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    if (audio.duration < 3) throw new Error('Tệp âm thanh cần dài ít nhất 3 giây.');
    if (audio.duration > MAX_SECONDS) throw new Error('Tệp âm thanh vượt quá thời lượng tối đa 60 giây.');
    const wav = encodeMonoWav(audio);
    inspectReferenceWav(wav);
    return wav;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Tệp âm thanh')) throw error;
    throw new Error('Không đọc được tệp. Hãy thử MP3 hoặc WAV khác.');
  }
}
