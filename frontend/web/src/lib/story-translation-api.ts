import { ApiError, request } from './api';
import type { StoryChapter, StoryPage } from '../../../shared/story';
import type { ApprovedTranslation, StoryGlossary, TranslationChunk, TranslationPlan, TranslationProgress } from '../../../shared/story-translation';

const root = (chapter: StoryChapter) => `/audiobooks/${chapter.projectId}/chapters/${chapter.chapterId}`;
const plan = (chapter: StoryChapter, planId: string) => `${root(chapter)}/translation-plans/${planId}`;

export const storyTranslationApi = {
  glossary: (projectId: string) => request<StoryGlossary>(`/audiobooks/${projectId}/glossary`),
  saveGlossary: (projectId: string, data: StoryGlossary) => request<StoryGlossary>(
    `/audiobooks/${projectId}/glossary`, { method: 'PUT', body: JSON.stringify(data) }),
  plans: (chapter: StoryChapter) => request<StoryPage<TranslationPlan>>(`${root(chapter)}/translation-plans?limit=50`),
  create: (chapter: StoryChapter, targetLang: string) => request<TranslationPlan>(
    `${root(chapter)}/translation-plans`, { method: 'POST',
      body: JSON.stringify({ chapterRevision: chapter.revision, targetLang }) }),
  progress: (chapter: StoryChapter, planId: string) => request<TranslationProgress>(`${plan(chapter, planId)}/progress`),
  action: (chapter: StoryChapter, planId: string, action: 'start' | 'tick' | 'pause' | 'resume') =>
    request<TranslationProgress>(`${plan(chapter, planId)}/${action}`, { method: 'POST', body: '{}' }),
  chunk: (chapter: StoryChapter, planId: string, index: number) =>
    request<TranslationChunk>(`${plan(chapter, planId)}/chunks/${index}`),
  edit: (chapter: StoryChapter, planId: string, index: number, translatedText: string, version: number) =>
    request<TranslationChunk>(`${plan(chapter, planId)}/chunks/${index}`, { method: 'PUT',
      body: JSON.stringify({ translatedText, version }) }),
  retry: (chapter: StoryChapter, planId: string, index: number) =>
    request<TranslationProgress>(`${plan(chapter, planId)}/chunks/${index}/retry`, { method: 'POST', body: '{}' }),
  approved: (chapter: StoryChapter) => request<ApprovedTranslation>(`${root(chapter)}/approved-translation`),
  async approvedOrNull(chapter: StoryChapter) {
    try { return await this.approved(chapter); }
    catch (error) {
      if (error instanceof ApiError && error.code === 'TRANSLATION_NOT_APPROVED') return null;
      throw error;
    }
  },
  approve: (chapter: StoryChapter, planId: string, version: number) =>
    request<ApprovedTranslation>(`${plan(chapter, planId)}/approve`, { method: 'POST', body: JSON.stringify({ version }) }),
  approvedSegment: (chapter: StoryChapter, index: number) =>
    request<{ index: number; text: string }>(`${root(chapter)}/approved-translation/${index}`),
};
