import { useEffect, useRef, useState } from 'react';
import { api, DEMO } from '../lib/api';
import type { Language } from '../lib/types';
import type { StoryChapter, StoryPlan, StoryProgress } from '../../../shared/story';
import { storyBatchApi, type PlanInput } from '../lib/story-batch-api';
import { languageNames } from '../../../shared/languages';
import StoryRunProgress from '../components/StoryRunProgress';
import StoryAudioSettings, { voiceName } from '../components/StoryAudioSettings';
import { storyListeningQueue, storyQueuePages } from '../../../shared/story-playback';
import { useStoryPlayback } from '../hooks/StoryPlayback';
import { Icon } from '../components/ui';
import { mergeStoryMp3 } from '../lib/story-merge';

const message = (error: unknown) => error instanceof Error ? error.message : 'Chưa hoàn tất thao tác.';

export default function StoryAudio({ chapter, dirty, targetLang, approvedRevision }: {
  chapter: StoryChapter; dirty: boolean; targetLang?: string; approvedRevision?: string;
}) {
  const playback = useStoryPlayback();
  const [reload, setReload] = useState(0);
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<Language[]>([]);
  const [plans, setPlans] = useState<StoryPlan[]>([]);
  const [plan, setPlan] = useState<StoryPlan | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [quota, setQuota] = useState<number | null>(null);
  const [provider, setProvider] = useState<'azure' | 'gemini'>('azure');
  const [voice, setVoice] = useState('');
  const [speed, setSpeed] = useState(0.9);
  const [style, setStyle] = useState('neutral');
  const [intensity, setIntensity] = useState(1);
  const [readLang, setReadLang] = useState(chapter.sourceLang);
  const [useApproved, setUseApproved] = useState(false);
  const outputLang = useApproved && approvedRevision ? targetLang || chapter.sourceLang : readLang;
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [mergeProgress, setMergeProgress] = useState(0);

  useEffect(() => {
    if (DEMO) return;
    let live = true;
    setError(''); setReady(false); setPlans([]); setPlan(null); setProgress(null); setCursor(undefined);
    Promise.all([api.voices(), storyBatchApi.plans(chapter)]).then(async ([voices, list]) => {
      if (!live) return;
      setCatalog(voices.filter(item => ['azure', 'gemini'].includes(item.provider) && item.available !== false));
      setPlans(list.items); setQuota(list.quotaRemainingEstimate);
      const latest = list.items[0] ?? null;
      setPlan(latest);
      if (latest) {
        const saved = await storyBatchApi.progress(chapter, latest.planId);
        if (live) setProgress(saved);
      }
      if (live) setReady(true);
    }).catch(err => { if (live) setError(message(err)); });
    return () => { live = false; };
  }, [chapter.chapterId, chapter.revision, reload]);

  useEffect(() => {
    const first = catalog.find(item => item.lang === outputLang && item.provider === provider && item.voices.length);
    const preferred = first?.voices.reduce((best, item) => (item.styles?.length || 0) >
      (best.styles?.length || 0) ? item : best, first.voices[0]);
    setVoice(preferred?.id ?? ''); setSpeed(0.9); setStyle('neutral'); setIntensity(1);
  }, [catalog, outputLang, provider]);

  useEffect(() => {
    if (!plan || !['RUNNING', 'PAUSING'].includes(progress?.status || '')) return;
    const controller = new AbortController();
    let live = true;
    let visible = document.visibilityState !== 'hidden';
    let inFlight = false;
    let activeStatus = progress?.status || '';
    let timer: ReturnType<typeof setTimeout>;
    let delay = 4000;
    const poll = async () => {
      if (!live || !visible || inFlight) return;
      inFlight = true;
      try {
        let next = await storyBatchApi.progress(chapter, plan.planId, undefined, controller.signal);
        if (next.status === 'RUNNING' && next.queued > 0 &&
            next.claimed + next.submitted + next.processing === 0)
          next = await storyBatchApi.tick(chapter, plan.planId, controller.signal);
        if (!live) return;
        setProgress(next); setCursor(undefined); setQuota(next.quotaRemainingEstimate); setError('');
        activeStatus = next.status;
        delay = 4000;
      } catch (err) {
        if (!live) return;
        setError(message(err)); delay = Math.min(delay * 2, 30000);
      } finally {
        inFlight = false;
        if (visible && ['RUNNING', 'PAUSING'].includes(activeStatus))
          timer = setTimeout(poll, delay);
      }
    };
    const onVisibility = () => {
      visible = document.visibilityState !== 'hidden';
      if (!visible) clearTimeout(timer);
      else void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    timer = setTimeout(poll, delay);
    return () => { live = false; controller.abort(); clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility); };
  }, [chapter.chapterId, plan?.planId, progress?.status]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); } catch (err) { setError(message(err)); }
    finally { locked.current = false; setBusy(false); }
  }

  async function selectPlan(id: string) {
    const chosen = plans.find(item => item.planId === id) ?? null;
    setPlan(chosen); setCursor(undefined);
    setProgress(chosen ? await storyBatchApi.progress(chapter, id) : null);
  }

  async function control(action: 'pause' | 'resume', segmentId?: string) {
    if (!plan) return;
    const next = action === 'pause' ? await storyBatchApi.pause(chapter, plan.planId)
      : segmentId ? await storyBatchApi.retry(chapter, plan.planId, segmentId)
        : await storyBatchApi.resume(chapter, plan.planId);
    setProgress(next); setQuota(next.quotaRemainingEstimate); setCursor(undefined);
  }

  async function createAndStart() {
    const translated = !!approvedRevision && useApproved;
    const translateTo = translated || outputLang === chapter.sourceLang ? null : outputLang;
    const input: PlanInput = { provider, voice, speed, style, styleIntensity: intensity, translateTo,
      textSource: translated ? 'approved_translation' : 'original' };
    const created = await storyBatchApi.create(chapter, input);
    setPlan(created); setCursor(undefined);
    const draft = await storyBatchApi.progress(chapter, created.planId);
    setProgress(draft); setQuota(draft.quotaRemainingEstimate);
    const estimate = created.provider === 'gemini'
      ? `\nƯớc tính ${created.providerCallsEstimate ?? 0} lượt Gemini TTS; còn khoảng ${draft.providerCallsRemainingEstimate ?? 'không rõ'} lượt hôm nay.` : '';
    if (!window.confirm(`Tạo ${created.total} bản thu bằng ${created.provider}?${estimate}`)) {
      setPlans((items) => [created, ...items.filter(item => item.planId !== created.planId)]);
      return;
    }
    const next = await storyBatchApi.start(chapter, created.planId);
    setProgress(next); setQuota(next.quotaRemainingEstimate);
    const list = await storyBatchApi.plans(chapter); setPlans(list.items);
  }

  async function mergeAudio() {
    if (!plan || !progress || progress.done !== progress.total || progress.total < 2) return;
    setMergeProgress(0);
    const urls: string[] = [];
    let nextCursor: string | null = null;
    do {
      const page = await storyBatchApi.progress(chapter, plan.planId, nextCursor || undefined);
      if (page.done !== page.total || page.items.some(item => item.status !== 'DONE' || !item.audioUrl))
        throw new Error('Chưa đủ MP3 để gộp. Hãy tải lại tiến độ.');
      urls.push(...page.items.map(item => item.audioUrl!));
      nextCursor = page.nextCursor;
    } while (nextCursor && urls.length < progress.total);
    if (urls.length !== progress.total) throw new Error('Danh sách MP3 chưa đầy đủ.');
    await mergeStoryMp3(urls, `chuong ${String(chapter.chapterNumber).padStart(2, '0')} - tron bo.mp3`, setMergeProgress);
    setMergeProgress(0);
  }

  const language = catalog.find(item => item.provider === provider && item.lang === outputLang);
  const samePlan = !!plan && plan.sourceChapterRevision === chapter.revision && plan.provider === provider &&
    plan.voice === voice && plan.speed === speed && plan.style === style && plan.styleIntensity === intensity &&
    (plan.translateTo || null) === (useApproved && approvedRevision ? null : outputLang === chapter.sourceLang ? null : outputLang) &&
    (plan.textSource || 'original') === (useApproved && approvedRevision ? 'approved_translation' : 'original') &&
    (plan.textSource !== 'approved_translation' || plan.translationRevision === approvedRevision);
  const canGenerate = ready && !busy && !dirty && !progress?.uncertain && !!voice && !!chapter.segmentCount &&
    !['RUNNING', 'PAUSING', 'UNCERTAIN'].includes(progress?.status || '') &&
    Number.isFinite(speed) && speed >= 0.7 && speed <= 1.2 &&
    !(samePlan && !!progress && progress.status !== 'DRAFT');
  const setup = <div className="story-generation">
      {dirty && <p className="story-hint">Lưu nội dung chương trước khi tạo audio.</p>}
      {approvedRevision && <label className="story-audio-source"><input type="checkbox" checked={useApproved}
        onChange={event => setUseApproved(event.target.checked)} /> Đọc bản dịch đã duyệt</label>}
      {plan?.textSource === 'approved_translation' && approvedRevision && plan.translationRevision !== approvedRevision &&
        <p className="story-hint">Bản dịch đã duyệt mới hơn kế hoạch audio này. Tạo kế hoạch mới để đọc bản mới.</p>}
      <details className="story-voice-options"><summary><Icon name="mic" size={18} />
        <span>{language?.voices.find(item => item.id === voice)?.name || voice || 'Chọn giọng kể'}</span>
        <small>{provider === 'gemini' ? 'Gemini' : 'Azure'} · {speed}×</small><Icon name="chevron" size={16} /></summary>
      {targetLang && targetLang !== chapter.sourceLang && !useApproved && <label className="story-read-language">Ngôn ngữ đọc
        <select aria-label="Ngôn ngữ đọc" value={readLang} disabled={busy} onChange={event => setReadLang(event.target.value)}>
          {[chapter.sourceLang, targetLang].map(code => <option key={code} value={code}>{languageNames[code] || code}</option>)}
        </select></label>}
      <StoryAudioSettings language={language} outputLang={outputLang} provider={provider} voice={voice}
        speed={speed} style={style} intensity={intensity} onProvider={setProvider}
        onVoice={value => { setVoice(value); setStyle('neutral'); setIntensity(1); }} onSpeed={setSpeed}
        onStyle={value => { setStyle(value); setIntensity(1); }} onIntensity={setIntensity} /></details>
      <div className="story-audio-summary"><span>{chapter.segmentCount} đoạn</span>
        <span>{chapter.textLength.toLocaleString('vi-VN')} ký tự</span>
        {quota !== null && <span>Còn {quota.toLocaleString('vi-VN')} ký tự hôm nay</span>}</div>
      <button type="button" className="primary-button" disabled={!canGenerate} onClick={() => void run(createAndStart)}>
        <Icon name="wave" size={18} />{busy ? 'Đang chuẩn bị…' : 'Tạo giọng kể'}
      </button>
  </div>;
  return <section className="story-audio" aria-label="Tạo audio chương">
    <div className="story-audio-heading"><h3>Giọng kể</h3>
      <span>{outputLang !== chapter.sourceLang
        ? `${languageNames[chapter.sourceLang] || chapter.sourceLang} → ${languageNames[outputLang] || outputLang}`
        : languageNames[outputLang] || outputLang}</span></div>
    {DEMO ? <p>Cần kết nối backend để tạo audio chương.</p> : <>
      {error && <div role="alert" className="inline-error">{error}{!ready && <button type="button" onClick={() => setReload(value => value + 1)}>Tải lại chương</button>}</div>}
      {!ready && !error && <p role="status" className="story-hint">Đang tải chương…</p>}
      {!progress?.done && setup}
      {plan && progress && <StoryRunProgress plan={plan} progress={progress} plans={plans}
        chapterNumber={chapter.chapterNumber} voiceLabel={voiceName(undefined, plan.voice, '', outputLang)}
        busy={busy} hasCursor={!!cursor} currentId={playback.currentId} playing={playback.playing}
        onPlay={index => void run(async () => {
          const first = await storyBatchApi.progress(chapter, plan.planId);
          const items = await storyQueuePages(first, cursor => storyBatchApi.progress(chapter, plan.planId, cursor));
          const queue = storyListeningQueue(chapter, plan, items, index);
          if (!queue.length) throw new Error('Đoạn này chưa sẵn sàng. Hãy làm mới chương.');
          await playback.play(queue);
        })}
        onPause={() => void run(() => control('pause'))}
        onResume={() => void run(() => control('resume'))}
        onRetry={id => void run(() => control('resume', id))}
        onSelectPlan={id => void run(() => selectPlan(id))}
        onNext={() => void run(async () => {
          const next = await storyBatchApi.progress(chapter, plan.planId, progress.nextCursor!);
          setProgress(next); setCursor(progress.nextCursor!);
        })}
        onTop={() => void run(async () => { setProgress(await storyBatchApi.progress(chapter, plan.planId)); setCursor(undefined); })} />}
      {!!progress?.done && <details className="story-create-options"><summary>Giọng kể & tạo mới</summary>{setup}</details>}
      {plan && progress && progress.total > 1 && progress.done === progress.total && <div className="story-merge">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(mergeAudio)}>
          {busy ? `Đang gộp ${mergeProgress}/${progress.total} đoạn…` : 'Gộp và tải MP3 cả chương'}
        </button><small>Gộp trên thiết bị; bản thu từng đoạn vẫn dùng được.</small>
      </div>}
    </>}
  </section>;
}
