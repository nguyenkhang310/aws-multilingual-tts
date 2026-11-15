import { useEffect, useRef, useState } from 'react';
import type { StoryChapter, StoryProject } from '../../../shared/story';
import { translateStoryChapters } from '../../../shared/story-translation-run';
import { storyTranslationApi as api } from '../lib/story-translation-api';

export default function StoryTranslationBatch({ project, chapters }: { project: StoryProject; chapters: StoryChapter[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<StoryChapter | null>(null);
  const [completed, setCompleted] = useState(0);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const currentPlan = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const hidden = () => { if (document.hidden) { controller.current?.abort(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { controller.current?.abort(); document.removeEventListener('visibilitychange', hidden); };
  }, []);

  async function translateMany() {
    if (running) return;
    setRunning(true); setCompleted(0); setError('');
    try {
      const request = new AbortController(); controller.current = request;
      const count = await translateStoryChapters(api, project, chapters.filter(item => selected.includes(item.chapterId)), request.signal,
        value => { setActive(value.chapter); setCompleted(value.completed); currentPlan.current = value.planId; });
      if (!request.signal.aborted) setCompleted(count);
    } catch (err) { if (!controller.current?.signal.aborted) setError(err instanceof Error ? err.message : 'Chưa dịch được các chương đã chọn.'); }
    finally { setActive(null); currentPlan.current = null; setRunning(false); }
  }

  async function pause() {
    controller.current?.abort();
    if (active && currentPlan.current) {
      try { await api.action(active, currentPlan.current, 'pause'); }
      catch (err) { setError(err instanceof Error ? err.message : 'Chưa tạm dừng được.'); }
    }
  }

  const available = chapters.filter(item => item.contentRevision && item.sourceLang !== project.targetLang);
  if (!available.length) return null;
  return <details className="story-translation-batch"><summary>Dịch nhiều chương</summary>
    {available.map(item => <label key={item.chapterId}><input type="checkbox" checked={selected.includes(item.chapterId)}
      disabled={running} onChange={event => setSelected(current => event.target.checked
        ? [...current, item.chapterId] : current.filter(id => id !== item.chapterId))} />
      {item.chapterNumber}. {item.title}</label>)}
    <div className="story-actions"><button disabled={running} onClick={() => setSelected(available.map(item => item.chapterId))}>Chọn tất cả</button>
      <button className="primary-button" disabled={running || !selected.length} onClick={() => void translateMany()}>
        Dịch các chương đã chọn</button>
      {running && <button onClick={() => void pause()}>Tạm dừng</button>}</div>
    {running && <p>Đang dịch chương {active?.chapterNumber} · đã xử lý {completed}/{selected.length} chương.</p>}
    {!running && completed > 0 && <p>{completed} chương đã xử lý. Xem bản dịch trong từng chương.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </details>;
}
