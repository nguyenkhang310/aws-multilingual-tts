import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Action, Circle, Label, Wave } from './ui';
import Sheet from './Sheet';
import { StoryCard, StoryError, storyStyles as styles, useStoryAction, useStoryPolling } from './StoryControls';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';
import { time } from '../lib/model';
import { api } from '../lib/api';
import { storyBatchApi, storyTranslationApi } from '../lib/story-api';
import { expressionOptions } from '../../../shared/expression';
import type { ApprovedTranslation } from '../../../shared/story-translation';
import type { StoryChapter, StoryPlan, StoryProgress } from '../../../shared/story';
import { languageNames } from '../../../shared/languages';

export default function StoryAudio({ chapter, targetLang }: { chapter: StoryChapter; targetLang: string }) {
  const { colors, allLanguages } = useStudio(), playback = usePlayback();
  const { busy, error, setError, run, background } = useStoryAction();
  const [plans, setPlans] = useState<StoryPlan[]>([]), [plan, setPlan] = useState<StoryPlan | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null), [approved, setApproved] = useState<ApprovedTranslation | null>(null);
  const [provider, setProvider] = useState<'azure' | 'gemini'>('azure'), [choice, setVoice] = useState('');
  const [speed, setSpeed] = useState(0.9), [style, setStyle] = useState('neutral'), [intensity, setIntensity] = useState(1);
  const [useApproved, setUseApproved] = useState(false), [cursor, setCursor] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [sheet, setSheet] = useState<'settings' | 'voices' | 'plans' | 'confirm' | 'player' | 'styles' | null>(null);
  const outputLang = useApproved ? approved?.targetLang ?? targetLang : chapter.sourceLang;
  const language = allLanguages.find(item => item.provider === provider && item.lang === outputLang);
  const selectedVoice = language?.voices.find(item => item.id === choice) ?? language?.voices[0];
  const voice = selectedVoice?.id ?? '';
  useEffect(() => {
    let live = true;
    void Promise.all([storyBatchApi.plans(chapter), storyTranslationApi.approvedOrNull(chapter)]).then(async ([list, saved]) => {
      const latest = list.items[0] ?? null, state = latest ? await storyBatchApi.progress(chapter, latest.planId) : null;
      if (live) { setPlans(list.items); setPlan(latest); setProgress(state); setCursor(state?.nextCursor ?? null); setApproved(saved); }
    }).catch(reason => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, [chapter, setError]);
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
  return <>
    <StoryError text={error} />
    <StoryCard><Label size={20} weight="600">Giọng kể</Label>
      <View style={styles.row}><Action disabled={busy || active} primary={!useApproved} onPress={() => { setUseApproved(false); setStyle('neutral'); setIntensity(1); }}>Bản gốc</Action>
        {approved?.sourceRevision === chapter.revision && <Action disabled={busy || active} primary={useApproved} onPress={() => { setUseApproved(true); setStyle('neutral'); setIntensity(1); }}>Bản dịch đã duyệt</Action>}</View>
      <Action icon="mic" disabled={busy || active} onPress={() => setSheet('settings')}>{selectedVoice?.name ?? selectedVoice?.id ?? 'Chọn giọng'} · {provider === 'gemini' ? 'Gemini' : 'Azure'}</Action>
      <Label muted size={13}>{languageNames[outputLang] ?? outputLang} · {speed.toFixed(2)}×</Label>
      <Action primary disabled={busy || active || !selectedVoice || language?.available === false} onPress={() => void run(async () => {
        const created = await storyBatchApi.create(chapter, { provider, voice, speed, style, styleIntensity: style === 'neutral' ? 1 : intensity,
          textSource: useApproved ? 'approved_translation' : 'original' });
        setPlan(created); setPlans(items => [created, ...items.filter(item => item.planId !== created.planId)]);
        const state = await storyBatchApi.progress(chapter, created.planId); setProgress(state); setCursor(state.nextCursor); setSheet('confirm');
      })}>Tạo audio chương</Action>
    </StoryCard>
    {progress && plan && <StoryCard>
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
        {['PAUSED', 'BLOCKED_QUOTA', 'NEEDS_ATTENTION'].includes(progress.status) && <Action disabled={busy} onPress={() => void run(async () => apply(await storyBatchApi.resume(chapter, plan.planId)))}>Tiếp tục</Action>}
        <Action disabled={busy} onPress={() => void run(async () => apply(await storyBatchApi.progress(chapter, plan.planId)))}>Làm mới</Action>
      </View>
      {progress.items.map(item => <View key={item.segmentId} style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }]}>
        <Label style={{ flex: 1 }}>Đoạn {item.index + 1}</Label>
        {item.status === 'DONE' && item.jobId ? <Action icon="play" disabled={busy} accessibilityLabel={`Nghe đoạn ${item.index + 1}`} onPress={() => void run(async () => {
          const job = await api.job(item.jobId!);
          if (job.status !== 'DONE' || !job.audioUrl) throw new Error('Đoạn này chưa có âm thanh. Hãy làm mới tiến độ.');
          await playback.play({ ...job, text: job.text ?? `${chapter.title} · Đoạn ${item.index + 1}`, voice: plan.voice,
            lang: plan.language, speed: plan.speed, charCount: item.charCount, createdAt: plan.createdAt });
          setSheet('player');
        })}>Nghe</Action> : <Label size={13} muted>{item.status === 'FAILED' ? 'Lỗi' : item.status === 'UNCERTAIN' ? 'Cần đối soát' : item.status === 'QUEUED' ? 'Đang chờ' : 'Đang xử lý'}</Label>}
        {item.status === 'FAILED' && item.retryable && <Action disabled={busy || now < (item.nextRetryAt ?? 0) * 1000}
          onPress={() => void run(async () => apply(await storyBatchApi.retry(chapter, plan.planId, item.segmentId)))}>Thử lại</Action>}
      </View>)}
      {cursor && <Action disabled={busy} onPress={() => void run(async () => { const next = await storyBatchApi.progress(chapter, plan.planId, cursor); apply(next); setCursor(next.nextCursor); })}>Xem thêm đoạn</Action>}
    </StoryCard>}
    {!!plans.length && <Action disabled={busy || active} onPress={() => setSheet('plans')}>Các lần tạo ({plans.length})</Action>}
    <Sheet title="Xác nhận tạo audio" visible={sheet === 'confirm'} close={() => { if (!busy) setSheet(null); }}><StoryError text={error} />
      <Label size={20} weight="600">{chapter.title}</Label><Label>{plan?.total} đoạn · {plan?.totalChars.toLocaleString('vi-VN')} ký tự</Label>
      {plan?.providerCallsEstimate != null && <Label muted>{plan.providerCallsEstimate} lượt Gemini dự kiến</Label>}
      <Action primary disabled={busy || !plan} onPress={() => void run(async () => { if (plan) apply(await storyBatchApi.start(chapter, plan.planId)); setSheet(null); })}>Bắt đầu tạo</Action>
    </Sheet>
    <Sheet title="Cài đặt giọng kể" visible={sheet === 'settings'} close={() => setSheet(null)}>
      <View style={styles.row}>{(['azure', 'gemini'] as const).map(value => <Action key={value} primary={provider === value} onPress={() => { setProvider(value); setVoice(''); setStyle('neutral'); setIntensity(1); }}>{value === 'azure' ? 'Azure Speech' : 'Gemini TTS'}</Action>)}</View>
      <Action onPress={() => setSheet('voices')}>{selectedVoice?.name ?? selectedVoice?.id ?? 'Chọn giọng kể'}</Action>
      {language?.available === false && <Label muted>Chưa bật nguồn giọng này ở máy chủ.</Label>}
      <Label weight="600">Tốc độ · {speed.toFixed(2)}×</Label><Slider accessibilityLabel="Tốc độ giọng kể" value={speed} onValueChange={setSpeed} minimumValue={0.7} maximumValue={1.2} step={0.05} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} />
      <Action onPress={() => setSheet('styles')}>Sắc thái · {expressionOptions(selectedVoice?.styles, provider === 'gemini' || !!language?.autoEmotionEnabled).find(item => item.value === style)?.label ?? 'Tự nhiên'}</Action>
      {style !== 'neutral' && selectedVoice?.styleIntensityRange && <><Label>Cường độ · {intensity.toFixed(1)}</Label>
        <Slider accessibilityLabel="Cường độ giọng kể" value={intensity} onValueChange={setIntensity} minimumValue={0.1} maximumValue={2} step={0.1} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} /></>}
      <Action primary onPress={() => setSheet(null)}>Xong</Action>
    </Sheet>
    <Sheet title="Sắc thái giọng kể" visible={sheet === 'styles'} close={() => setSheet('settings')}>
      {expressionOptions(selectedVoice?.styles, provider === 'gemini' || !!language?.autoEmotionEnabled).map(item =>
        <Action key={item.value} primary={style === item.value} onPress={() => { setStyle(item.value); setIntensity(1); setSheet('settings'); }}>{item.label}</Action>)}
    </Sheet>
    <Sheet title="Chọn giọng kể" visible={sheet === 'voices'} close={() => setSheet('settings')}>
      {language?.voices.map(item => <Action key={item.id} primary={voice === item.id} onPress={() => { setVoice(item.id); setStyle('neutral'); setIntensity(1); setSheet('settings'); }}>{item.name ?? item.id}</Action>)}
      {!language?.voices.length && <Label muted>Chưa có giọng phù hợp với ngôn ngữ này.</Label>}
    </Sheet>
    <Sheet title="Nghe chương" visible={sheet === 'player'} close={() => { playback.stop(); setSheet(null); }}>
      <View style={{ alignItems: 'center', gap: 16, paddingVertical: 20 }}><Wave compact moving={playback.playing} />
        <Label size={20} weight="600">{chapter.title}</Label></View>
      <Slider accessibilityLabel="Tua âm thanh chương" disabled={!playback.canSeek} value={playback.position}
        minimumValue={0} maximumValue={Math.max(playback.total, 1)} onSlidingComplete={playback.seek}
        minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} />
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label muted size={13}>{time(playback.position)}</Label><Label muted size={13}>{time(playback.total)}</Label></View>
      <View style={[styles.row, { justifyContent: 'center' }]}><Circle name={playback.playing ? 'pause' : 'play'} size={64} primary
        label={playback.playing ? 'Tạm dừng đoạn' : 'Phát đoạn'} onPress={() => void playback.toggle()} />
        <Circle name="share" label="Lưu hoặc chia sẻ đoạn MP3" disabled={playback.sharing || !playback.canSeek} onPress={() => void playback.share()} /></View>
    </Sheet>
    <Sheet title="Các lần tạo audio" visible={sheet === 'plans'} close={() => setSheet(null)}>{plans.map(item => <Action key={item.planId} onPress={() => void run(async () => {
      const state = await storyBatchApi.progress(chapter, item.planId); setPlan(item); setProgress(state); setCursor(state.nextCursor); setSheet(null);
    })}>{new Date(item.createdAt).toLocaleString('vi-VN')} · {item.voice}</Action>)}</Sheet>
  </>;
}
