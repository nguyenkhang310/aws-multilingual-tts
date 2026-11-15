import { request } from './api';
import type { StoryChapter, StoryPage, StoryPlan, StoryProgress } from '../../../shared/story';

const path = (item: StoryChapter) => `/audiobooks/${item.projectId}/chapters/${item.chapterId}`;
const planPath = (item: StoryChapter, planId: string) => `${path(item)}/audio-plans/${planId}`;
export type PlanInput = { provider: 'azure' | 'gemini'; voice: string; speed: number;
  style: string; styleIntensity: number; translateTo?: string | null;
  textSource?: 'original' | 'approved_translation' };

export const storyBatchApi = {
  plans: (chapter: StoryChapter) => request<StoryPage<StoryPlan> & { quotaRemainingEstimate: number }>(
    `${path(chapter)}/audio-plans?limit=50`),
  create: (chapter: StoryChapter, input: PlanInput) => request<StoryPlan>(
    `${path(chapter)}/audio-plans`, { method: 'POST',
      body: JSON.stringify({ ...input, chapterRevision: chapter.revision }) }),
  start: (chapter: StoryChapter, planId: string) => request<StoryProgress>(
    `${planPath(chapter, planId)}/start`, { method: 'POST', body: '{}' }),
  tick: (chapter: StoryChapter, planId: string, signal?: AbortSignal) => request<StoryProgress>(
    `${planPath(chapter, planId)}/tick`, { method: 'POST', body: '{}', signal }),
  pause: (chapter: StoryChapter, planId: string) => request<StoryProgress>(
    `${planPath(chapter, planId)}/pause`, { method: 'POST', body: '{}' }),
  resume: (chapter: StoryChapter, planId: string) => request<StoryProgress>(
    `${planPath(chapter, planId)}/resume`, { method: 'POST', body: '{}' }),
  retry: (chapter: StoryChapter, planId: string, segmentId: string) => request<StoryProgress>(
    `${planPath(chapter, planId)}/segments/${segmentId}/retry`, { method: 'POST', body: '{}' }),
  progress: (chapter: StoryChapter, planId: string, cursor?: string, signal?: AbortSignal) => request<StoryProgress>(
    `${path(chapter)}/audio-progress?planId=${planId}&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
};
