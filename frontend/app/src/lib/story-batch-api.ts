import { request } from './api';
import type { StoryChapter, StoryPage, StoryPlan, StoryProgress } from '../../../shared/story';

const base = (item: StoryChapter) => `/audiobooks/${item.projectId}/chapters/${item.chapterId}`;

export const storyBatchApi = {
  createApproved: (item: StoryChapter, provider: 'azure' | 'gemini', voice: string) => request<StoryPlan>(
    `${base(item)}/audio-plans`, { method: 'POST', body: JSON.stringify({ chapterRevision: item.revision,
      textSource: 'approved_translation', provider, voice, speed: 0.9, style: 'neutral', styleIntensity: 1 }) }),
  plans: (item: StoryChapter) => request<StoryPage<StoryPlan>>(`${base(item)}/audio-plans?limit=50`),
  progress: (item: StoryChapter, planId: string) => request<StoryProgress>(
    `${base(item)}/audio-progress?planId=${planId}&limit=20`),
  start: (item: StoryChapter, planId: string) => request<StoryProgress>(
    `${base(item)}/audio-plans/${planId}/start`, { method: 'POST', body: '{}' }),
  tick: (item: StoryChapter, planId: string) => request<StoryProgress>(
    `${base(item)}/audio-plans/${planId}/tick`, { method: 'POST', body: '{}' }),
  pause: (item: StoryChapter, planId: string) => request<StoryProgress>(
    `${base(item)}/audio-plans/${planId}/pause`, { method: 'POST', body: '{}' }),
  resume: (item: StoryChapter, planId: string) => request<StoryProgress>(
    `${base(item)}/audio-plans/${planId}/resume`, { method: 'POST', body: '{}' }),
  retry: (item: StoryChapter, planId: string, segmentId: string) => request<StoryProgress>(
    `${base(item)}/audio-plans/${planId}/segments/${segmentId}/retry`, { method: 'POST', body: '{}' }),
};
