import type { StoryChapter, StoryChapterAudio, StoryPlan, StoryQueueItem, StoryProgress } from './story';

export type ChapterAudioRef = { projectId: string; chapterId: string; planId: string };

export function chapterRecording(chapter: StoryChapter, plan: StoryPlan, audio: StoryChapterAudio, title = chapter.title) {
  if (audio.status !== 'DONE' || !audio.audioUrl) throw new Error('MP3 chương chưa sẵn sàng.');
  return { jobId: `chapter-${plan.planId}`, status: 'DONE' as const, audioUrl: audio.audioUrl,
    chapterAudio: { projectId: chapter.projectId, chapterId: chapter.chapterId, planId: plan.planId },
    storyChapterId: chapter.chapterId, title, text: title, lang: plan.translateTo || plan.language,
    voice: plan.voice, speed: plan.speed, charCount: plan.totalChars, createdAt: plan.createdAt };
}

export async function freshRecording<T extends { jobId: string; status: string; audioUrl: string | null; chapterAudio?: ChapterAudioRef }>(
  record: T, loadJob: (id: string) => Promise<{ status: string; audioUrl: string | null }>,
  loadChapter: (chapter: ChapterAudioRef, planId: string) => Promise<StoryChapterAudio>,
): Promise<T> {
  const next = record.chapterAudio ? await loadChapter(record.chapterAudio, record.chapterAudio.planId) : await loadJob(record.jobId);
  if (next.status !== 'DONE' || !next.audioUrl) throw new Error('Bản thu chưa có âm thanh. Hãy làm mới.');
  return { ...record, ...next, status: 'DONE', audioUrl: next.audioUrl };
}

export async function storyQueuePages(first: StoryProgress, next: (cursor: string) => Promise<StoryProgress>) {
  const items = new Map(first.items.map(item => [item.index, item]));
  const seen = new Set<string>();
  let cursor = first.nextCursor;
  while (cursor) {
    if (seen.has(cursor) || seen.size >= first.total) throw new Error('Danh sách đoạn chưa đầy đủ. Hãy làm mới chương.');
    seen.add(cursor);
    const page = await next(cursor);
    if (page.planId !== first.planId) throw new Error('Lần tạo đã thay đổi. Hãy chọn lại bản thu.');
    for (const item of page.items) items.set(item.index, item);
    cursor = page.nextCursor;
  }
  return [...items.values()].sort((a, b) => a.index - b.index);
}

/** Only contiguous, finished parts belong in a listening queue. Never skip a failed part silently. */
export function storyListeningQueue(chapter: StoryChapter, plan: StoryPlan, items: StoryQueueItem[], start: number) {
  const ordered = [...items].sort((a, b) => a.index - b.index);
  const first = ordered.findIndex(item => item.index === start);
  if (first < 0) return [];
  const queue = [];
  for (let i = first; i < ordered.length; i++) {
    const item = ordered[i];
    if (item.index !== start + queue.length || item.status !== 'DONE' || !item.jobId || !item.audioUrl) break;
    queue.push({ jobId: item.jobId, status: 'DONE' as const, audioUrl: item.audioUrl,
      title: `${chapter.title} · Đoạn ${item.index + 1}`, storyChapterId: chapter.chapterId,
      text: `${chapter.title} · Đoạn ${item.index + 1}`, voice: plan.voice, lang: plan.translateTo || plan.language,
      speed: plan.speed, provider: plan.provider, charCount: item.charCount, createdAt: plan.createdAt });
  }
  return queue;
}

export function validChapterNumber(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 100_000;
}
