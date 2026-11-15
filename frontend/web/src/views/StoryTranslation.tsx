import { useEffect, useRef, useState } from 'react';
import { languageNames } from '../../../shared/languages';
import type { StoryChapter } from '../../../shared/story';
import type { ApprovedTranslation, TranslationChunk, TranslationPlan, TranslationProgress } from '../../../shared/story-translation';
import { storyTranslationApi as api } from '../lib/story-translation-api';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Chưa hoàn tất bản dịch.';

export default function StoryTranslation({ chapter, targetLang, onApproved, onEditing }: {
  chapter: StoryChapter; targetLang: string; onApproved: (value: ApprovedTranslation | null) => void; onEditing?: (value: boolean) => void;
}) {
  const [plan, setPlan] = useState<TranslationPlan | null>(null);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [approved, setApproved] = useState<ApprovedTranslation | null>(null);
  const [chunk, setChunk] = useState<TranslationChunk | null>(null);
  const [index, setIndex] = useState(0);
  const [edit, setEdit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    let live = true;
    setPlan(null); setProgress(null); setChunk(null); setApproved(null);
    Promise.all([api.plans(chapter), api.approvedOrNull(chapter)]).then(async ([plans, saved]) => {
      const latest = plans.items[0] ?? null;
      const next = latest ? await api.progress(chapter, latest.planId) : null;
      if (!live) return;
      setApproved(saved); onApproved(saved); setPlan(latest); setProgress(next);
    }).catch(err => { if (live) setError(errorText(err)); });
    return () => { live = false; };
  }, [chapter.chapterId, chapter.revision]);

  useEffect(() => {
    if (!plan || dirty.current) return;
    let live = true;
    api.chunk(chapter, plan.planId, index).then(item => {
      if (live && !dirty.current) { setChunk(item); setEdit(item.translatedText ?? ''); }
    }).catch(err => { if (live) setError(errorText(err)); });
    return () => { live = false; };
  }, [chapter.chapterId, plan?.planId, index, progress?.counts.DONE, progress?.counts.EDITED]);

  useEffect(() => {
    if (!plan || progress?.status !== 'RUNNING') return;
    let live = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>, inFlight = false;
    const poll = async () => {
      if (!live || document.hidden || inFlight) return;
      if (lock.current) { timer = setTimeout(poll, 1000); return; }
      inFlight = true;
      try {
        const next = await api.action(chapter, plan.planId, 'tick', controller.signal);
        if (live) setProgress(next);
      } catch (err) { if (live) { setError(errorText(err)); timer = setTimeout(poll, 4000); } }
      finally { inFlight = false; }
    };
    const visible = () => { clearTimeout(timer); if (!document.hidden) void poll(); };
    timer = setTimeout(poll, 1000); document.addEventListener('visibilitychange', visible);
    return () => { live = false; controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [chapter.chapterId, plan?.planId, progress]);

  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (err) { setError(errorText(err)); }
    finally { lock.current = false; setBusy(false); }
  }

  if (!chapter.contentRevision || chapter.sourceLang === targetLang) return null;
  const completed = (progress?.counts.DONE ?? 0) + (progress?.counts.EDITED ?? 0);
  return <section className="surface story-panel story-translation" aria-label="Dịch truyện">
    <h2>Dịch sang {languageNames[targetLang] ?? targetLang}</h2>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {approved && <p>Đã duyệt bản dịch · {approved.textLength.toLocaleString('vi-VN')} ký tự. </p>}
    <button className={plan ? 'secondary-button' : 'primary-button'} disabled={busy} onClick={() => void perform(async () => {
      const created = await api.create(chapter, targetLang);
      setIndex(0); setPlan(created); setProgress(await api.progress(chapter, created.planId));
    })}>{plan ? 'Cập nhật kế hoạch dịch' : 'Lập kế hoạch dịch'}</button>
    {plan && progress && <>
      <p>{completed}/{progress.total} phần đã dịch · {progress.totalChars.toLocaleString('vi-VN')} ký tự nguồn · {progress.status}</p>
      <div className="story-actions">
        {progress.status === 'DRAFT' && <button disabled={busy} onClick={() => void perform(async () =>
          setProgress(await api.action(chapter, plan.planId, 'start')))}>Bắt đầu dịch</button>}
        {progress.status === 'RUNNING' && <button disabled={busy} onClick={() => void perform(async () =>
          setProgress(await api.action(chapter, plan.planId, 'pause')))}>Tạm dừng</button>}
        {['PAUSED', 'BLOCKED_QUOTA', 'NEEDS_ATTENTION'].includes(progress.status) &&
          <button disabled={busy} onClick={() => void perform(async () =>
            setProgress(await api.action(chapter, plan.planId, 'resume')))}>Tiếp tục</button>}
        {completed === progress.total && <button className="primary-button" disabled={busy || (chunk !== null && edit !== (chunk.translatedText ?? ''))}
          onClick={() => void perform(async () => {
            const saved = await api.approve(chapter, plan.planId, approved?.version ?? 0);
            setApproved(saved); onApproved(saved);
          })}>Duyệt bản dịch</button>}
      </div>
      <div className="story-actions"><button disabled={busy || index === 0} onClick={() => setIndex(index - 1)}>Phần trước</button>
        <span>Phần {index + 1}/{plan.total}</span>
        <button disabled={busy || index + 1 >= plan.total} onClick={() => setIndex(index + 1)}>Phần sau</button></div>
      {chunk && <div className="story-translation-grid">
        <div><strong>Bản gốc</strong><p>{chunk.sourceText}</p></div>
        <label><strong>Bản dịch</strong><textarea value={edit} maxLength={6000}
          onChange={event => { const value = event.target.value; dirty.current = value !== (chunk.translatedText ?? ''); setEdit(value); onEditing?.(dirty.current); }} aria-label="Chỉnh bản dịch" /></label>
      </div>}
      {chunk && <div className="story-actions">
        {['DONE', 'EDITED', 'FAILED', 'UNCERTAIN'].includes(chunk.status) && <button disabled={busy || !edit.trim() || edit === chunk.translatedText}
          onClick={() => void perform(async () => {
            const updated = await api.edit(chapter, plan.planId, index, edit, chunk.version ?? 1);
            dirty.current = false; onEditing?.(false); setChunk(updated); setProgress(await api.progress(chapter, plan.planId));
          })}>Lưu bản chỉnh</button>}
        {chunk.status === 'FAILED' && <button disabled={busy} onClick={() => void perform(async () =>
          setProgress(await api.retry(chapter, plan.planId, index)))}>Thử lại phần lỗi</button>}
      </div>}
    </>}
  </section>;
}
