import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const resourceId = (value: string) => {
  try { const url = new URL(value, 'https://audio.invalid'); return `${url.origin}${url.pathname}`; }
  catch { return value.split('?')[0]; }
};

export default function StoryTrackPlayer({ fileName, src, onPlaybackStart, onPlaybackStop }: {
  fileName: string; src: string; onPlaybackStart: (audio: HTMLAudioElement) => void;
  onPlaybackStop: (audio: HTMLAudioElement) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const callbacks = useRef({ onPlaybackStart, onPlaybackStop });
  callbacks.current = { onPlaybackStart, onPlaybackStop };
  const latestSrc = useRef(src);
  latestSrc.current = src;
  const activeSrc = useRef('');
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeSrc.current && resourceId(activeSrc.current) === resourceId(src)) return;
    activeSrc.current = src;
    setCurrent(0); setDuration(0); setError('');
    audio.src = src;
    audio.load();
  }, [src]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); callbacks.current.onPlaybackStop(audio); }
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    setError('');
    if (!audio.paused) { audio.pause(); return; }
    const fresh = latestSrc.current;
    if ((audio.ended || audio.currentTime === 0) && fresh !== activeSrc.current &&
        resourceId(fresh) === resourceId(activeSrc.current)) {
      activeSrc.current = fresh;
      audio.src = fresh;
      audio.load();
    }
    const attemptedSrc = activeSrc.current;
    try { await audio.play(); }
    catch {
      if (latestSrc.current === attemptedSrc)
        setError('Không phát được MP3. Tải lại tiến độ rồi thử lại.');
    }
  }

  async function download() {
    setDownloading(true); setError('');
    try {
      const response = await fetch(latestSrc.current, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('download');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = fileName;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Chưa tải được MP3. Tải lại tiến độ rồi thử lại.'); }
    finally { setDownloading(false); }
  }

  return <div className="story-track" aria-label={fileName}>
    <div className="story-track-heading"><Icon name="headphones" size={18} /><strong>{fileName}</strong></div>
    <div className="story-track-controls">
      <button className="story-track-play" aria-label={playing ? 'Tạm dừng MP3' : 'Phát MP3'} onClick={() => void toggle()}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <time>{formatTime(current)}</time>
      <input type="range" aria-label={`Vị trí phát ${fileName}`} min={0} max={duration || 1} step={0.1}
        value={Math.min(current, duration || 1)} disabled={!duration}
        onChange={event => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setCurrent(next); }} />
      <time>{duration ? formatTime(duration) : '—:—'}</time>
      <button className="story-track-download" aria-label={`Tải ${fileName}`} disabled={downloading}
        onClick={() => void download()}><Icon name={downloading ? 'clock' : 'download'} size={17} /></button>
    </div>
    {error && <small role="alert" className="story-track-error">{error}</small>}
    <audio ref={audioRef} preload="metadata" onLoadedMetadata={event => {
      const value = event.currentTarget.duration; setDuration(Number.isFinite(value) ? value : 0);
    }} onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)}
      onPlay={event => { callbacks.current.onPlaybackStart(event.currentTarget); setPlaying(true); }}
      onPause={event => { callbacks.current.onPlaybackStop(event.currentTarget); setPlaying(false); }}
      onEnded={event => { callbacks.current.onPlaybackStop(event.currentTarget); setPlaying(false); setCurrent(0); }}
      onError={event => {
        const audio = event.currentTarget;
        const fresh = latestSrc.current;
        if (fresh !== activeSrc.current && resourceId(fresh) === resourceId(activeSrc.current)) {
          const position = audio.currentTime;
          const resume = !audio.paused;
          activeSrc.current = fresh;
          setError('Đang làm mới đường dẫn MP3…');
          audio.addEventListener('loadedmetadata', () => {
            audio.currentTime = Math.min(position, Number.isFinite(audio.duration) ? audio.duration : position);
            if (resume) void audio.play().then(() => setError(''))
              .catch(() => setError('Đã làm mới đường dẫn. Nhấn phát để nghe tiếp.'));
            else setError('Đường dẫn MP3 đã được làm mới. Nhấn phát để nghe tiếp.');
          }, { once: true });
          audio.src = fresh;
          audio.load();
          return;
        }
        setError('Không tải được MP3. Tải lại tiến độ rồi thử lại.');
      }} />
  </div>;
}
