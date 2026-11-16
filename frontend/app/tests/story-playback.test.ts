import assert from 'node:assert/strict';
import test from 'node:test';
import { storyListeningQueue, storyQueuePages, validChapterNumber } from '../../shared/story-playback';
import type { StoryChapter, StoryPlan, StoryProgress, StoryQueueItem } from '../../shared/story';
const chapter = { title: 'Khởi đầu', chapterId: 'chapter' } as StoryChapter;
const plan = { voice: 'HoaiMy', language: 'vi-VN', speed: 0.9, provider: 'azure' } as StoryPlan;
const part = (index: number, status = 'DONE') => ({ index, status, jobId: `job-${index}`, audioUrl: `https://fixture.invalid/${index}`, charCount: 20 } as StoryQueueItem);

test('Listening keeps part order, metadata and never skips a failed or missing part', () => {
  const parts = [part(2), part(0), part(1), part(3, 'FAILED'), part(4)];
  const queue = storyListeningQueue(chapter, plan, parts, 0);
  assert.deepEqual(queue.map(item => item.jobId), ['job-0', 'job-1', 'job-2']);
  assert.equal(queue[0].title, 'Khởi đầu · Đoạn 1');
  assert.equal(queue[0].storyChapterId, 'chapter');
  assert.equal(storyListeningQueue(chapter, plan, parts, 3).length, 0);
  assert.deepEqual(storyListeningQueue(chapter, plan, [part(0), part(2)], 0).map(item => item.jobId), ['job-0']);
  assert.equal(storyListeningQueue(chapter, plan, [part(0)], 1).length, 0);
});

test('Listening loads later pages; repeated cursors and changed plans fail explicitly', async () => {
  const first = { planId: 'plan', items: [part(0)], total: 3, nextCursor: 'next' } as StoryProgress;
  const items = await storyQueuePages(first, async cursor => { assert.equal(cursor, 'next'); return { ...first, items: [part(1), part(2)], nextCursor: null }; });
  assert.equal(items.length, 3);
  await assert.rejects(storyQueuePages(first, async () => first), /chưa đầy đủ/);
  await assert.rejects(storyQueuePages(first, async () => ({ ...first, planId: 'other', nextCursor: null })), /đã thay đổi/);
});

test('Chapter number accepts only whole numbers inside the backend range', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, 100001]) assert.equal(validChapterNumber(value), false);
  for (const value of [1, 999, 100000]) assert.equal(validChapterNumber(value), true);
});
