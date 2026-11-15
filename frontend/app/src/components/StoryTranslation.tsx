import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Action, Label } from './ui';
import { StoryCard, StoryError, StoryInput, storyStyles as styles, useStoryAction, useStoryPolling } from './StoryControls';
import { storyTranslationApi as api } from '../lib/story-api';
import type { StoryChapter } from '../../../shared/story';
import type { ApprovedTranslation, TranslationChunk, TranslationPlan, TranslationProgress } from '../../../shared/story-translation';
import { languageNames } from '../../../shared/languages';

export default function StoryTranslation({ chapter, targetLang, onEditing }: { chapter: StoryChapter; targetLang: string; onEditing: (value: boolean) => void }) {
  const [plan, setPlan] = useState<TranslationPlan | null>(null), [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [approved, setApproved] = useState<ApprovedTranslation | null>(null), [chunk, setChunk] = useState<TranslationChunk | null>(null);
  const [index, setIndex] = useState(0), [edit, setEdit] = useState(''), [loading, setLoading] = useState(false);
  const dirty = useRef(false);
  const { busy, error, setError, run, background } = useStoryAction();
  useEffect(() => {
    let live = true;
    void Promise.all([api.plans(chapter), api.approvedOrNull(chapter)]).then(async ([list, saved]) => {
      const latest = list.items[0] ?? null, next = latest ? await api.progress(chapter, latest.planId) : null;
      if (live) { setLoading(!!latest); setPlan(latest); setProgress(next); setApproved(saved); }
    }).catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [chapter, setError]);
  useEffect(() => {
    if (!plan || dirty.current) return;
    let live = true;
    void api.chunk(chapter, plan.planId, index).then(item => { if (live && !dirty.current) { setChunk(item); setEdit(item.translatedText ?? ''); } })
      .catch(error => { if (live) setError(error.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [chapter, plan, index, progress?.counts.DONE, progress?.counts.EDITED, progress?.counts.FAILED, setError]);
  useStoryPolling(progress?.status === 'RUNNING', async signal => {
    if (!plan) return;
    await background(async () => {
      const next = await api.action(chapter, plan.planId, 'tick', signal);
      if (!signal.aborted) setProgress(next);
    });
  }, setError);
  if (chapter.sourceLang === targetLang) return <Label muted>Không cần dịch · {languageNames[targetLang] ?? targetLang}</Label>;
  const completed = (progress?.counts.DONE ?? 0) + (progress?.counts.EDITED ?? 0);
  async function act(action: 'start' | 'pause' | 'resume') { if (plan) setProgress(await api.action(chapter, plan.planId, action)); }
  const edited = edit !== (chunk?.translatedText ?? '');
  const controlsDisabled = busy || loading || edited;
  return <>
    <StoryError text={error} />
    <StoryCard><Label size={20} weight="600">Dịch sang {languageNames[targetLang] ?? targetLang}</Label>
      {approved && <Label muted size={13}>Đã duyệt · {approved.textLength.toLocaleString('vi-VN')} ký tự</Label>}
      <Action primary disabled={busy || progress?.status === 'RUNNING' || edited} onPress={() => void run(async () => {
        const next = await api.create(chapter, targetLang); dirty.current = false; setLoading(true); setIndex(0); setPlan(next);
        setProgress(await api.progress(chapter, next.planId));
      })}>{plan ? 'Cập nhật kế hoạch dịch' : 'Chuẩn bị bản dịch'}</Action>
      {plan && progress && <>
        <Label muted>{completed}/{progress.total} phần</Label>
        <View style={styles.row}>
          {progress.status === 'DRAFT' && <Action disabled={busy} onPress={() => void run(() => act('start'))}>Bắt đầu dịch</Action>}
          {progress.status === 'RUNNING' && <Action disabled={busy} onPress={() => void run(() => act('pause'))}>Tạm dừng</Action>}
          {['PAUSED', 'BLOCKED_QUOTA', 'NEEDS_ATTENTION'].includes(progress.status) && <Action disabled={busy} onPress={() => void run(() => act('resume'))}>Tiếp tục</Action>}
          <Action disabled={busy} onPress={() => void run(async () => setProgress(await api.progress(chapter, plan.planId)))}>Làm mới</Action>
        </View>
      </>}
    </StoryCard>
    {plan && chunk && <StoryCard>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Action disabled={controlsDisabled || index === 0} onPress={() => { setLoading(true); setIndex(index - 1); }}>Trước</Action>
        <Label muted>Phần {index + 1}/{plan.total}</Label><Action disabled={controlsDisabled || index + 1 >= plan.total} onPress={() => { setLoading(true); setIndex(index + 1); }}>Sau</Action></View>
      <Label weight="600">Bản gốc</Label><Label size={15} style={{ lineHeight: 24 }}>{chunk.sourceText}</Label>
      <StoryInput label="Chỉnh bản dịch" multiline value={edit} maxLength={6000} editable={!busy && !loading && ['DONE', 'EDITED', 'FAILED', 'UNCERTAIN'].includes(chunk.status)}
        onChangeText={value => { dirty.current = value !== (chunk.translatedText ?? ''); setEdit(value); onEditing(dirty.current); }} />
      {edited && <View style={styles.row}><Action primary disabled={busy || !edit.trim()} onPress={() => void run(async () => {
        const item = await api.edit(chapter, plan.planId, index, edit, chunk.version ?? 1);
        dirty.current = false; onEditing(false); setChunk(item); setProgress(await api.progress(chapter, plan.planId));
      })}>Lưu bản chỉnh</Action><Action disabled={busy} onPress={() => { dirty.current = false; onEditing(false); setEdit(chunk.translatedText ?? ''); }}>Bỏ chỉnh sửa</Action></View>}
      {chunk.status === 'FAILED' && <Action disabled={busy} onPress={() => void run(async () => setProgress(await api.retry(chapter, plan.planId, index)))}>Thử lại phần lỗi</Action>}
      {completed === plan.total && <Action primary disabled={controlsDisabled} onPress={() => void run(async () => setApproved(await api.approve(chapter, plan.planId, approved?.version ?? 0)))}>Duyệt bản dịch</Action>}
    </StoryCard>}
  </>;
}
