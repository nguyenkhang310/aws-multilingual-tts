import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Slider from '@react-native-community/slider';
import { Action, Label } from './ui';
import Sheet from './Sheet';
import { StoryError, StoryChoices, storyStyles as styles, useStoryAction, useStoryPolling } from './StoryControls';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';
import { storyListeningQueue, storyQueuePages } from '../../../shared/story-playback';
import { storyBatchApi, storyTranslationApi } from '../lib/story-api';
import { expressionOptions } from '../../../shared/expression';
import type { ApprovedTranslation } from '../../../shared/story-translation';
import type { StoryChapter, StoryChapterAudio, StoryPlan, StoryProgress } from '../../../shared/story';
import { languageNames } from '../../../shared/languages';

export default function StoryAudio({ chapter, storyTitle, targetLang }: { chapter: StoryChapter; storyTitle: string; targetLang: string }) {
  const { colors, allLanguages } = useStudio(), playback = usePlayback();
  const { busy, error, setError, run, background } = useStoryAction();
  const [reload, setReload] = useState(0);
  const [ready, setReady] = useState(false), [configure, setConfigure] = useState(false);
  const [plans, setPlans] = useState<StoryPlan[]>([]), [plan, setPlan] = useState<StoryPlan | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null), [approved, setApproved] = useState<ApprovedTranslation | null>(null);
  const [chapterAudio, setChapterAudio] = useState<StoryChapterAudio | null>(null);
  const [provider, setProvider] = useState<'azure' | 'gemini'>('azure'), [choice, setVoice] = useState('');
  const [speed, setSpeed] = useState(0.9), [style, setStyle] = useState('neutral'), [intensity, setIntensity] = useState(1);
  const [readLang, setReadLang] = useState(chapter.sourceLang);
  const [useApproved, setUseApproved] = useState(false), [cursor, setCursor] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [sheet, setSheet] = useState<'settings' | 'voices' | 'plans' | 'confirm' | 'styles' | null>(null);
  const outputLang = useApproved ? approved?.targetLang ?? targetLang : readLang;
  const language = allLanguages.find(item => item.provider === provider && item.lang === outputLang);
  const selectedVoice = language?.voices.find(item => item.id === choice) ?? language?.voices[0];
  const voice = selectedVoice?.id ?? '';
  useEffect(() => {
    let live = true;
    void Promise.all([storyBatchApi.plans(chapter), storyTranslationApi.approvedOrNull(chapter)]).then(async ([list, saved]) => {
      const latest = list.items[0] ?? null, state = latest ? await storyBatchApi.progress(chapter, latest.planId) : null;
      const audio = latest ? await storyBatchApi.chapterAudio(chapter, latest.planId) : null;
      if (live) { setPlans(list.items); setPlan(latest); setProgress(state); setCursor(state?.nextCursor ?? null); setApproved(saved); setChapterAudio(audio); setReady(true); }
    }).catch(reason => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, [chapter, setError, reload]);
  function apply(next: StoryProgress) {
    setProgress(previous => ({ ...next, items: [...new Map([...(previous?.planId === next.planId ? previous.items : []), ...next.items].map(item => [item.index, item])).values()].sort((a, b) => a.index - b.index) }));
  }
  useStoryPolling(!!plan && ['RUNNING', 'PAUSING'].includes(progress?.status ?? ''), async signal => {
    if (!plan) return;
    await background(async () => {
      let next = await storyBatchApi.progress(chapter, plan.planId, undefined, signal);
      if (!signal.aborted && next.status === 'RUNNING' && next.queued > 0 && next.claimed + next.submitted + next.processing === 0)
        next = await storyBatchApi.tick(chapter, plan.planId, signal);
      if (!signal.aborted) apply(next);
    });
  }, setError);
  useEffect(() => {
    const pending = progress?.items.filter(item => item.retryable && (item.nextRetryAt ?? 0) * 1000 > now).map(item => item.nextRetryAt! * 1000) ?? [];
    if (!pending.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(...pending) - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [progress, now]);
  const active = progress?.status === 'RUNNING' || progress?.status === 'PAUSING';
  const statuses: Record<string, string> = { DRAFT: 'Chờ xác nhận', RUNNING: 'Đang tạo audio', PAUSING: 'Đang dừng', PAUSED: 'Đã tạm dừng', COMPLETED: 'Hoàn tất', STALE: 'Nội dung đã thay đổi', BLOCKED_QUOTA: 'Đã hết hạn mức', NEEDS_ATTENTION: 'Cần kiểm tra' };
  const itemError = (code?: string | null) => code === 'GEMINI_TTS_QUOTA'
    ? 'Gemini đang giới hạn lượt hoặc hết quota. Thử lại sau, hoặc tạo kế hoạch mới bằng Azure Speech.' : code ?? 'Lỗi tạm thời';
  const providerQuotaFailed = progress?.items.some(item => item.errorCode === 'GEMINI_TTS_QUOTA') ?? false;
  const setup = <>
    <View style={{ gap: 18 }}><Label size={20} weight="600">Giọng kể</Label>
      <View style={styles.row}><Action disabled={busy || active} primary={!useApproved} onPress={() => { setUseApproved(false); setStyle('neutral'); setIntensity(1); }}>Bản gốc</Action>
        {approved?.sourceRevision === chapter.revision && <Action disabled={busy || active} primary={useApproved} onPress={() => { setUseApproved(true); setStyle('neutral'); setIntensity(1); }}>Bản dịch đã duyệt</Action>}</View>
      <Action icon="mic" disabled={busy || active} onPress={() => setSheet('settings')}>{selectedVoice?.name ?? selectedVoice?.id ?? 'Chọn giọng'} · {provider === 'gemini' ? 'Gemini' : 'Azure'}</Action>
      <Label muted size={13}>{languageNames[outputLang] ?? outputLang} · {speed.toFixed(2)}×</Label>
      <Action primary disabled={!ready || busy || active || !!progress?.uncertain || !selectedVoice || language?.available === false} onPress={() => void run(async () => {
        const created = await storyBatchApi.create(chapter, { provider, voice, speed, style, styleIntensity: style === 'neutral' ? 1 : intensity,
          translateTo: !useApproved && outputLang !== chapter.sourceLang ? outputLang : null,
          textSource: useApproved ? 'approved_translation' : 'original' });
        setPlan(created); setChapterAudio(null); setPlans(items => [created, ...items.filter(item => item.planId !== created.planId)]);
        const state = await storyBatchApi.progress(chapter, created.planId); setProgress(state); setCursor(state.nextCursor); setSheet('confirm');
      })}>Tạo giọng kể</Action>
    </View>
  </>;
  return <>
    <StoryError text={error} />
    {!!error && !ready && <Action onPress={() => { setError(''); setReload(value => value + 1); }}>Tải lại chương</Action>}
    {!ready && !error && <Label muted>Đang tải chương…</Label>}
    {!progress?.done && setup}
    {progress && plan && <View style={{ gap: 16, borderTopWidth: 1, borderColor: colors.line, paddingTop: 22 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label weight="600">{statuses[progress.status] ?? 'Chờ xử lý'}</Label>
        <Label muted>{progress.done}/{progress.total} đoạn</Label></View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percentComplete }}
        style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(0, Math.min(100, progress.percentComplete))}%`, height: 6, backgroundColor: colors.blue }} /></View>
      {!!progress.failed && <Label style={{ color: colors.danger }}>{progress.failed} đoạn lỗi</Label>}
      {!!progress.uncertain && <Label muted>Đang cần đối soát {progress.uncertain} đoạn. Không gửi lại.</Label>}
      <View style={styles.row}>
        {progress.status === 'DRAFT' && <Action disabled={busy} onPress={() => setSheet('confirm')}>Xác nhận tạo</Action>}
        {progress.status === 'RUNNING' && <Action disabled={busy} onPress={() => void run(async () => apply(await storyBatchApi.pause(chapter, plan.planId)))}>Tạm dừng</Action>}
        {progress.uncertain === 0 && !providerQuotaFailed && ['PAUSED', 'BLOCKED_QUOTA', 'NEEDS_ATTENTION'].includes(progress.status) && <Action disabled={busy} onPress={() => void run(async () => apply(await storyBatchApi.resume(chapter, plan.planId)))}>Tiếp tục</Action>}
        <Action disabled={busy} onPress={() => void run(async () => apply(await storyBatchApi.progress(chapter, plan.planId)))}>Làm mới</Action>
      </View>
      {progress.items.map(item => <View key={item.segmentId} style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }]}>
        <Label style={{ flex: 1 }}>Đoạn {item.index + 1}</Label>
        {item.status === 'DONE' && item.jobId ? <Action icon={playback.current?.jobId === item.jobId && playback.playing ? 'pause' : 'play'} disabled={busy}
          accessibilityLabel={`${playback.current?.jobId === item.jobId && playback.playing ? 'Tạm dừng' : 'Nghe'} đoạn ${item.index + 1}`} onPress={() => void run(async () => {
            if (playback.current?.jobId === item.jobId) await playback.toggle();
            else {
              const first = await storyBatchApi.progress(chapter, plan.planId);
              const items = await storyQueuePages(first, cursor => storyBatchApi.progress(chapter, plan.planId, cursor));
              const queue = storyListeningQueue(chapter, plan, items, item.index);
              if (!queue.length) throw new Error('Đoạn này chưa sẵn sàng. Hãy làm mới chương.');
              await playback.playQueue(queue);
            }
          })}>{playback.current?.jobId === item.jobId && playback.playing ? 'Đang phát' : 'Nghe'}</Action>
          : <Label size={13} muted>{item.status === 'FAILED' ? itemError(item.errorCode) : item.status === 'UNCERTAIN' ? 'Cần đối soát' : item.status === 'QUEUED' ? 'Đang chờ' : 'Đang xử lý'}</Label>}
        {item.status === 'FAILED' && item.retryable && <Action disabled={busy || now < (item.nextRetryAt ?? 0) * 1000}
          onPress={() => void run(async () => apply(await storyBatchApi.retry(chapter, plan.planId, item.segmentId)))}>Thử lại</Action>}
      </View>)}
      {cursor && <Action disabled={busy} onPress={() => void run(async () => { const next = await storyBatchApi.progress(chapter, plan.planId, cursor); apply(next); setCursor(next.nextCursor); })}>Xem thêm đoạn</Action>}
      {progress.done === progress.total && progress.total > 0 && <View style={styles.row}>
        <Action disabled={busy} onPress={() => void run(async () => {
          let result = await storyBatchApi.chapterAudio(chapter, plan.planId);
          for (let step = 0; step < 40 && !['DONE', 'MISSING'].includes(result.status); step++)
            result = await storyBatchApi.advanceChapterAudio(chapter, plan.planId);
          setChapterAudio(result);
        })}>{busy ? 'Đang chuẩn bị MP3 chương…' : chapterAudio?.status === 'DONE' ? 'Làm mới MP3 chương' : 'Tạo MP3 chương'}</Action>
        {chapterAudio?.status === 'DONE' && chapterAudio.audioUrl && <Action icon="play" disabled={busy} onPress={() => void run(async () => {
          await playback.play({ jobId: plan.planId, status: 'DONE', audioUrl: chapterAudio.audioUrl ?? null,
            text: '', lang: plan.language, voice: plan.voice, charCount: plan.totalChars,
            createdAt: plan.createdAt, title: `Chương ${chapter.chapterNumber} - ${storyTitle}` });
        })}>Nghe cả chương</Action>}
        {chapterAudio?.status === 'DONE' && <Action disabled={busy} onPress={() => void run(async () => {
          const fresh = await storyBatchApi.chapterAudio(chapter, plan.planId);
          if (!fresh.downloadUrl) throw new Error('MP3 chương chưa sẵn sàng để tải.');
          if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) { await Linking.openURL(fresh.downloadUrl); return; }
          if (!FileSystem.cacheDirectory) throw new Error('Thiết bị chưa có thư mục tạm để tải MP3.');
          const safeTitle = storyTitle.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim() || 'truyen';
          const path = `${FileSystem.cacheDirectory}chuong ${String(chapter.chapterNumber).padStart(2, '0')} - ${safeTitle}.mp3`;
          try {
            const downloaded = await FileSystem.downloadAsync(fresh.downloadUrl, path);
            if (downloaded.status !== 200) throw new Error('Chưa tải được MP3 chương.');
            await Sharing.shareAsync(downloaded.uri, { mimeType: 'audio/mpeg', UTI: 'public.mp3' });
          } finally { await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {}); }
        })}>Tải MP3 chương</Action>}
      </View>}
      {chapterAudio?.status === 'MISSING' && <Label style={{ color: colors.danger }}>{chapterAudio.error}</Label>}
    </View>}
    {!!progress?.done && <><Action icon="settings" onPress={() => setConfigure(value => !value)}>{configure ? 'Ẩn cài đặt giọng' : 'Giọng kể & tạo mới'}</Action>{configure && setup}</>}
    {!!plans.length && <Action disabled={busy || active} onPress={() => setSheet('plans')}>Các lần tạo ({plans.length})</Action>}
    <Sheet title={({ settings: 'Giọng kể', voices: 'Chọn giọng kể', styles: 'Sắc thái giọng kể', plans: 'Các lần tạo', confirm: 'Xác nhận tạo audio' } as const)[sheet ?? 'settings']} visible={!!sheet} close={() => { if (!busy) setSheet(sheet === 'voices' || sheet === 'styles' ? 'settings' : null); }}>
      {sheet === 'confirm' && <><StoryError text={error} />
      <Label size={20} weight="600">{chapter.title}</Label><Label>{plan?.total} đoạn · {plan?.totalChars.toLocaleString('vi-VN')} ký tự</Label>
      {plan?.providerCallsEstimate != null && <Label muted>{plan.providerCallsEstimate} lượt Gemini dự kiến</Label>}
      <Action primary disabled={busy || !plan} onPress={() => void run(async () => { if (plan) apply(await storyBatchApi.start(chapter, plan.planId)); setSheet(null); })}>Bắt đầu tạo</Action>
    </>}
      {sheet === 'settings' && <>
      {!useApproved && targetLang !== chapter.sourceLang && <View style={styles.row}>{[chapter.sourceLang, targetLang].map(code =>
        <Action key={code} primary={readLang === code} onPress={() => { setReadLang(code); setVoice(''); setStyle('neutral'); setIntensity(1); }}>{languageNames[code] ?? code}</Action>)}</View>}
      <View style={styles.row}>{(['azure', 'gemini'] as const).map(value => <Action key={value} primary={provider === value} onPress={() => { setProvider(value); setVoice(''); setStyle('neutral'); setIntensity(1); }}>{value === 'azure' ? 'Azure Speech' : 'Gemini TTS'}</Action>)}</View>
      <Action onPress={() => setSheet('voices')}>{selectedVoice?.name ?? selectedVoice?.id ?? 'Chọn giọng kể'}</Action>
      {language?.available === false && <Label muted>Chưa bật nguồn giọng này ở máy chủ.</Label>}
      <Label weight="600">Tốc độ · {speed.toFixed(2)}×</Label><Slider accessibilityLabel="Tốc độ giọng kể" value={speed} onValueChange={setSpeed} minimumValue={0.7} maximumValue={1.2} step={0.05} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} />
      <Action onPress={() => setSheet('styles')}>Sắc thái · {expressionOptions(selectedVoice?.styles, provider === 'gemini' || !!language?.autoEmotionEnabled).find(item => item.value === style)?.label ?? 'Tự nhiên'}</Action>
      {style !== 'neutral' && selectedVoice?.styleIntensityRange && <><Label>Cường độ · {intensity.toFixed(1)}</Label>
        <Slider accessibilityLabel="Cường độ giọng kể" value={intensity} onValueChange={setIntensity} minimumValue={0.1} maximumValue={2} step={0.1} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} /></>}
      <Action primary onPress={() => setSheet(null)}>Xong</Action>
    </>}
      {sheet === 'styles' && <StoryChoices value={style} items={expressionOptions(selectedVoice?.styles, provider === 'gemini' || !!language?.autoEmotionEnabled)}
        onChange={value => { setStyle(value); setIntensity(1); setSheet('settings'); }} />}
      {sheet === 'voices' && <StoryChoices search value={voice} items={(language?.voices ?? []).map(item => ({ value: item.id, label: item.name ?? item.id }))}
        onChange={value => { setVoice(value); setStyle('neutral'); setIntensity(1); setSheet('settings'); }} />}
      {sheet === 'plans' && <>{plans.map(item => <Action key={item.planId} onPress={() => void run(async () => {
      const state = await storyBatchApi.progress(chapter, item.planId); setPlan(item); setProgress(state); setCursor(state.nextCursor);
      setChapterAudio(await storyBatchApi.chapterAudio(chapter, item.planId)); setSheet(null);
    })}>{new Date(item.createdAt).toLocaleString('vi-VN')} · {item.voice}</Action>)}</>}
    </Sheet>
  </>;
}
