import type { Language } from '../lib/types';
import { expressionName } from '../../../shared/expression';
import { languageNames } from '../../../shared/languages';

export const voiceName = (name: string | undefined, id: string, gender: string, lang: string) => {
  if (name && !/\p{Script=Han}/u.test(name)) return name;
  return `${gender === 'F' ? 'Nữ' : gender === 'M' ? 'Nam' : 'Giọng'} · ${languageNames[lang] || lang} · ${id.split('-').at(-1)?.replace(/Neural$/i, '') || id}`;
};

export default function StoryAudioSettings({ language, outputLang, provider, voice, speed, style, intensity,
  onProvider, onVoice, onSpeed, onStyle, onIntensity }: {
  language?: Language; outputLang: string; provider: 'azure' | 'gemini'; voice: string; speed: number;
  style: string; intensity: number; onProvider: (value: 'azure' | 'gemini') => void;
  onVoice: (value: string) => void; onSpeed: (value: number) => void;
  onStyle: (value: string) => void; onIntensity: (value: number) => void;
}) {
  const selected = language?.voices.find(item => item.id === voice);
  return <div className="story-fields story-audio-config">
    <label>Nguồn<select value={provider} onChange={event => onProvider(event.target.value as 'azure' | 'gemini')}>
      <option value="azure">Azure Speech</option><option value="gemini">Gemini TTS</option></select></label>
    <label>Giọng kể<select value={voice} onChange={event => onVoice(event.target.value)}>
      {(language?.voices ?? []).map(item => <option key={item.id} value={item.id}>
        {voiceName(item.name, item.id, item.gender, outputLang)}</option>)}</select></label>
    <label>Tốc độ<input type="number" step="0.1" min={0.7} max={1.2} value={speed}
      onChange={event => onSpeed(Number(event.target.value))} /></label>
    <label>Sắc thái giọng kể<select value={style} onChange={event => onStyle(event.target.value)}>
      <option value="neutral">Tự nhiên</option>
      {!!selected?.styles?.length && (provider === 'gemini' || language?.autoEmotionEnabled) &&
        <option value="auto">Tự nhận diện theo đoạn</option>}
      {(selected?.styles ?? []).map(item => <option key={item} value={item}>{expressionName(item)}</option>)}</select></label>
    {style !== 'neutral' && selected?.styleIntensityRange && <label>Cường độ {intensity.toFixed(1)}
      <input type="range" min={0.1} max={2} step={0.1} value={intensity}
        onChange={event => onIntensity(Number(event.target.value))} /></label>}
  </div>;
}
