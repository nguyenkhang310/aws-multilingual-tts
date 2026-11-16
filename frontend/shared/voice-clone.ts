export type VoiceCloneSettings = {
  denoise: boolean;
  useRefCodes: boolean;
  temperature: number;
};

export type VoiceProfile = {
  voiceProfileId: string;
  name: string;
  lang: 'vi-VN';
  createdAt: number;
  engine: string;
};

export const DEFAULT_VOICE_CLONE: VoiceCloneSettings = {
  denoise: true,
  useRefCodes: true,
  temperature: 0.8,
};

export function checkedVoiceProfiles(value: unknown): VoiceProfile[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items))
    throw new Error('Danh sách hồ sơ giọng chưa hợp lệ.');
  const items = (value as { items: unknown[] }).items;
  if (!items.every(item => item && typeof item === 'object' &&
    /^[a-f0-9]{32}$/.test(String((item as VoiceProfile).voiceProfileId)) &&
    typeof (item as VoiceProfile).name === 'string' && (item as VoiceProfile).lang === 'vi-VN' &&
    Number.isInteger((item as VoiceProfile).createdAt) && typeof (item as VoiceProfile).engine === 'string'))
    throw new Error('Thông tin hồ sơ giọng chưa hợp lệ.');
  return items as VoiceProfile[];
}

export function checkedVoiceProfile(value: unknown): VoiceProfile {
  const items = checkedVoiceProfiles({ items: [value] });
  if (items.length !== 1) throw new Error('Thông tin hồ sơ giọng chưa hợp lệ.');
  return items[0];
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function stabilityFromTemperature(temperature: number) {
  return Math.round((1 - (temperature - 0.4) / 0.6) * 100);
}

export function temperatureFromStability(stability: number) {
  return Math.round((1 - Math.max(0, Math.min(100, stability)) / 100) * 0.6 * 100 + 40) / 100;
}

export function inspectReferenceWav(bytes: Uint8Array) {
  if (bytes.length < 44 || bytes.length > 2 * 1024 * 1024) throw new Error('Mẫu cần là WAV dưới 2 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE') throw new Error('Tệp phải là WAV PCM.');
  let offset = 12, channels = 0, rate = 0, bits = 0, format = 0, dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > bytes.length) throw new Error('Tệp WAV bị lỗi.');
    if (text(offset) === 'fmt ' && size >= 16) {
      format = view.getUint16(offset + 8, true); channels = view.getUint16(offset + 10, true);
      rate = view.getUint32(offset + 12, true); bits = view.getUint16(offset + 22, true);
    }
    if (text(offset) === 'data') dataSize = size;
    offset += 8 + size + (size % 2);
  }
  const seconds = dataSize / (rate * channels * (bits / 8));
  if (format !== 1 || bits !== 16 || ![1, 2].includes(channels) || !rate || seconds < 3 || seconds > 8)
    throw new Error('Cần WAV PCM 16-bit, mono hoặc stereo, dài 3–8 giây.');
  return seconds;
}
