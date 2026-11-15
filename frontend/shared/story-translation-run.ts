import type { createStoryClient } from './story-client';
import type { StoryChapter, StoryProject } from './story';

type TranslationApi = ReturnType<typeof createStoryClient>['storyTranslationApi'];
export type StoryTranslationStep = { chapter: StoryChapter; planId: string | null; completed: number; total: number };

/** Prepare translations for review; approval and TTS always remain explicit user actions. */
export async function translateStoryChapters(api: TranslationApi, project: StoryProject, chapters: StoryChapter[],
  signal: AbortSignal, onStep: (step: StoryTranslationStep) => void): Promise<number> {
  const check = () => { if (signal.aborted) throw new Error('Đã dừng dịch.'); };
  const chosen = chapters.filter(item => item.contentRevision && item.sourceLang !== project.targetLang);
  const glossary = await api.glossary(project.projectId);
  let completed = 0;
  for (const chapter of chosen) {
    check(); onStep({ chapter, planId: null, completed, total: chosen.length });
    const saved = await api.approvedOrNull(chapter);
    check();
    if (saved && saved.sourceRevision === chapter.revision && saved.glossaryRevision === glossary.revision && saved.targetLang === project.targetLang) {
      completed++; continue;
    }
    const plan = await api.create(chapter, project.targetLang);
    check(); onStep({ chapter, planId: plan.planId, completed, total: chosen.length });
    let progress = await api.progress(chapter, plan.planId, signal);
    check();
    if (progress.status === 'DRAFT') progress = await api.action(chapter, plan.planId, 'start', signal);
    else if (progress.status === 'PAUSED') progress = await api.action(chapter, plan.planId, 'resume', signal);
    while (progress.status === 'RUNNING') { check(); progress = await api.action(chapter, plan.planId, 'tick', signal); }
    check();
    if (progress.status !== 'READY_FOR_REVIEW') throw new Error(`Chương ${chapter.chapterNumber} cần kiểm tra. Mở chương để xem phần lỗi.`);
    completed++;
  }
  return completed;
}
