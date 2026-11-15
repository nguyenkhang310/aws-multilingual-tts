import { ApiError, request } from './api';
import type { StoryChapter, StoryPage } from '../../../shared/story';
import type { ApprovedTranslation, TranslationChunk, TranslationPlan, TranslationProgress } from '../../../shared/story-translation';

const root = (chapter: StoryChapter) => `/audiobooks/${chapter.projectId}/chapters/${chapter.chapterId}`;
const plan = (chapter: StoryChapter, id: string) => `${root(chapter)}/translation-plans/${id}`;

export const storyTranslationApi = {
  plans: (chapter: StoryChapter) => request<StoryPage<TranslationPlan>>(`${root(chapter)}/translation-plans?limit=50`),
  create: (chapter: StoryChapter, targetLang: string) => request<TranslationPlan>(
    `${root(chapter)}/translation-plans`, { method: 'POST',
      body: JSON.stringify({ chapterRevision: chapter.revision, targetLang }) }),
  progress: (chapter: StoryChapter, id: string) => request<TranslationProgress>(`${plan(chapter, id)}/progress`),
  action: (chapter: StoryChapter, id: string, action: 'start' | 'tick' | 'pause' | 'resume') =>
    request<TranslationProgress>(`${plan(chapter, id)}/${action}`, { method: 'POST', body: '{}' }),
  chunk: (chapter: StoryChapter, id: string, index: number) =>
    request<TranslationChunk>(`${plan(chapter, id)}/chunks/${index}`),
  approved: (chapter: StoryChapter) => request<ApprovedTranslation>(`${root(chapter)}/approved-translation`),
  async approvedOrNull(chapter: StoryChapter) {
    try { return await this.approved(chapter); }
    catch (error) {
      if (error instanceof ApiError && error.code === 'TRANSLATION_NOT_APPROVED') return null;
      throw error;
    }
  },
  approve: (chapter: StoryChapter, id: string, version: number) =>
    request<ApprovedTranslation>(`${plan(chapter, id)}/approve`, { method: 'POST', body: JSON.stringify({ version }) }),
  retry: (chapter: StoryChapter, id: string, index: number) =>
    request<TranslationProgress>(`${plan(chapter, id)}/chunks/${index}/retry`, { method: 'POST', body: '{}' }),
};
