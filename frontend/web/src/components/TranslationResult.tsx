import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from './ui';
import { languageNames } from '../lib/data';
import type { HistoryItem } from '../lib/types';

export default function TranslationResult({ item, playing, onPlay, notify }: {
  item: HistoryItem; playing: boolean; onPlay: () => void; notify: (message: string, error?: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const section = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const frame = requestAnimationFrame(() => {
      const result = section.current, viewport = result?.closest('.route-view');
      if (!result || !viewport) return;
      const bounds = result.getBoundingClientRect(), visible = viewport.getBoundingClientRect();
      if (bounds.top >= visible.top && bounds.top < visible.bottom) return;
      const reduced = document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      viewport.scrollTo({ top: Math.max(0, viewport.scrollTop + bounds.top - visible.top), behavior: reduced ? 'instant' : 'smooth' });
    });
    return () => { alive.current = false; cancelAnimationFrame(frame); if (timer.current) clearTimeout(timer.current); };
  }, []);
  async function copy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(item.text);
      if (!alive.current) return;
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    } catch { if (alive.current) { setCopied(false); notify('Không sao chép được. Hãy chọn và sao chép văn bản.', true); } }
    finally { if (alive.current) setCopying(false); }
  }
  return <section ref={section} className="surface translation-result" aria-label="Bản dịch">
    <header className="translation-result-header">
      <span className="translation-result-icon"><Icon name="translate" size={21} /></span>
      <div className="translation-result-title"><h2>Kết quả dịch</h2><span>{languageNames[item.lang] || item.lang}</span></div>
      <div className="translation-result-actions">
        <Button className="secondary-button" aria-label={copied ? 'Đã sao chép' : 'Sao chép bản dịch'} disabled={copying} onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={16} /><span role="status">{copied ? 'Đã sao chép' : 'Sao chép bản dịch'}</span>
        </Button>
        <Button className="primary-button" onClick={onPlay}><Icon name={playing ? 'pause' : 'play'} size={16} />{playing ? 'Tạm dừng' : 'Nghe bản dịch'}</Button>
      </div>
    </header>
    <div className="translation-result-text" tabIndex={0} role="region" aria-label="Nội dung bản dịch"><p dir="auto">{item.text}</p></div>
  </section>;
}
