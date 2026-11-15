import { useRef, useState } from 'react';
import type { StoryChapter, StoryProject } from '../../../shared/story';
import { storyTranslationApi as api } from '../lib/story-translation-api';

export default function StoryTranslationBatch({ project, chapters }: { project: StoryProject; chapters: StoryChapter[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<StoryChapter | null>(null);
  const [completed, setCompleted] = useState(0);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const currentPlan = useRef<string | null>(null);

  async function translateMany() {
    if (running) return;
    stop.current = false; setRunning(true); setCompleted(0); setError('');
    try {
      const glossary = await api.glossary(project.projectId);
      const chosen = chapters.filter(item => selected.includes(item.chapterId) &&
        item.contentRevision && item.sourceLang !== project.targetLang);
      for (const chapter of chosen) {
        if (stop.current) break;
        setActive(chapter);
        const approved = await api.approvedOrNull(chapter);
        if (approved && approved.sourceRevision === chapter.revision &&
            approved.glossaryRevision === glossary.revision && approved.targetLang === project.targetLang) {
          setCompleted(value => value + 1);
          continue;
        }
        const plan = await api.create(chapter, project.targetLang);
        currentPlan.current = plan.planId;
        let progress = await api.progress(chapter, plan.planId);
        if (progress.status === 'DRAFT') progress = await api.action(chapter, plan.planId, 'start');
        else if (progress.status === 'PAUSED') progress = await api.action(chapter, plan.planId, 'resume');
        while (!stop.current && progress.status === 'RUNNING')
          progress = await api.action(chapter, plan.planId, 'tick');
        if (stop.current) break;
        if (progress.status !== 'READY_FOR_REVIEW') {
          setError(`Chương ${chapter.chapterNumber} cần kiểm tra: ${progress.status}. Mở chương để xem phần lỗi.`);
          break;
        }
        setCompleted(value => value + 1);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Chưa dịch được các chương đã chọn.'); }
    finally { setActive(null); currentPlan.current = null; setRunning(false); }
  }

  async function pause() {
    stop.current = true;
    if (active && currentPlan.current) {
      try { await api.action(active, currentPlan.current, 'pause'); }
      catch (err) { setError(err instanceof Error ? err.message : 'Chưa tạm dừng được.'); }
    }
  }

  const available = chapters.filter(item => item.contentRevision && item.sourceLang !== project.targetLang);
  if (!available.length) return null;
  return <details className="story-translation-batch"><summary>Dịch nhiều chương</summary>
    <p>Chọn chương cần dịch. Kết quả từng phần được lưu trên backend; mở lại chương để xem và duyệt.</p>
    {available.map(item => <label key={item.chapterId}><input type="checkbox" checked={selected.includes(item.chapterId)}
      disabled={running} onChange={event => setSelected(current => event.target.checked
        ? [...current, item.chapterId] : current.filter(id => id !== item.chapterId))} />
      {item.chapterNumber}. {item.title}</label>)}
    <div className="story-actions"><button disabled={running} onClick={() => setSelected(available.map(item => item.chapterId))}>Chọn tất cả</button>
      <button className="primary-button" disabled={running || !selected.length} onClick={() => void translateMany()}>
        Dịch các chương đã chọn</button>
      {running && <button onClick={() => void pause()}>Tạm dừng</button>}</div>
    {running && <p>Đang dịch chương {active?.chapterNumber} · đã xử lý {completed}/{selected.length} chương.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </details>;
}
