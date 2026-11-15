import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Action, Label } from './ui';
import Sheet from './Sheet';
import { StoryError, useStoryAction } from './StoryControls';
import { storyTranslationApi as api } from '../lib/story-api';
import { translateStoryChapters, type StoryTranslationStep } from '../../../shared/story-translation-run';
import type { StoryChapter, StoryProject } from '../../../shared/story';

export default function StoryTranslationBatch({ project, chapters, close }: { project: StoryProject; chapters: StoryChapter[]; close: () => void }) {
  const [selected, setSelected] = useState<string[]>([]), [step, setStep] = useState<StoryTranslationStep | null>(null), [completed, setCompleted] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null), current = useRef<StoryTranslationStep | null>(null);
  const { busy, error, setError, run } = useStoryAction();
  const available = chapters.filter(item => item.contentRevision && item.sourceLang !== project.targetLang);
  async function pause() {
    controller.current?.abort();
    const item = current.current;
    if (item?.planId) await api.action(item.chapter, item.planId, 'pause');
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') controller.current?.abort(); });
    return () => { controller.current?.abort(); subscription.remove(); };
  }, []);
  return <Sheet title="Dịch nhiều chương" visible close={() => { void pause().catch(() => {}).finally(close); }}>
    <StoryError text={error} />
    {available.map(item => <Action key={item.chapterId} icon={selected.includes(item.chapterId) ? 'check' : 'book'} disabled={busy}
      onPress={() => setSelected(items => items.includes(item.chapterId) ? items.filter(id => id !== item.chapterId) : [...items, item.chapterId])}>{item.chapterNumber}. {item.title}</Action>)}
    {!available.length && <Label muted>Chưa có chương cần dịch.</Label>}
    {!!available.length && <Action disabled={busy} onPress={() => setSelected(available.map(item => item.chapterId))}>Chọn tất cả</Action>}
    <Action primary disabled={busy || !selected.length} onPress={() => void run(async () => {
      const request = new AbortController(); controller.current = request; setCompleted(null);
      try {
        const count = await translateStoryChapters(api, project, available.filter(item => selected.includes(item.chapterId)), request.signal,
          value => { current.current = value; setStep(value); });
        setCompleted(count);
      } catch (error) { if (!request.signal.aborted) throw error; }
      finally { current.current = null; setStep(null); }
    })}>{busy ? `Đang dịch chương ${step?.chapter.chapterNumber ?? ''}` : 'Dịch các chương đã chọn'}</Action>
    {busy && <Action onPress={() => void pause().catch(error => setError(error.message))}>Tạm dừng</Action>}
    {completed !== null && <Label muted>{completed} chương đã xử lý. Mở từng chương để duyệt bản dịch.</Label>}
  </Sheet>;
}
