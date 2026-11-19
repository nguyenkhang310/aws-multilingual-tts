import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectReferenceWav, stabilityFromTemperature, temperatureFromStability } from '../../shared/voice-clone';
import { chapterRecording, freshRecording } from '../../shared/story-playback';
import type { StoryChapter, StoryPlan } from '../../shared/story';

test('WAV đủ dữ liệu mới được gửi lên, giữ đúng độ dài mẫu', () => {
  const data = new Uint8Array(44 + 3 * 8000 * 2), view = new DataView(data.buffer);
  const label = (start: number, value: string) => [...value].forEach((letter, i) => data[start + i] = letter.charCodeAt(0));
  label(0, 'RIFF'); label(8, 'WAVE'); label(12, 'fmt '); label(36, 'data');
  view.setUint32(4, data.length - 8, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  view.setUint32(40, data.length - 44, true);
  assert.equal(inspectReferenceWav(data), 3);
  assert.throws(() => inspectReferenceWav(data.slice(0, -2)));
  view.setUint16(34, 8, true); assert.throws(() => inspectReferenceWav(data));
  for (const level of [0, 5, 50, 75, 100]) assert.equal(stabilityFromTemperature(temperatureFromStability(level)), level);
});

test('WAV 60 giây hợp lệ; vượt thời lượng báo lỗi cụ thể', () => {
  const makeWav = (seconds: number) => {
    const data = new Uint8Array(44 + seconds * 8000 * 2), view = new DataView(data.buffer);
    const label = (start: number, value: string) => [...value].forEach((letter, i) => data[start + i] = letter.charCodeAt(0));
    label(0, 'RIFF'); label(8, 'WAVE'); label(12, 'fmt '); label(36, 'data');
    view.setUint32(4, data.length - 8, true); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    view.setUint32(40, data.length - 44, true);
    return data;
  };
  assert.equal(inspectReferenceWav(makeWav(60)), 60);
  assert.throws(() => inspectReferenceWav(makeWav(61)), /vượt quá thời lượng tối đa 60 giây/);
});

test('MP3 chương dùng endpoint riêng để gia hạn, không gọi job hay rơi sang bản thu thường', async () => {
  const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), title: 'Mở đầu' } as StoryChapter;
  const plan = { planId: 'c'.repeat(32), language: 'vi-VN', voice: 'Linh', speed: 1, totalChars: 20, createdAt: '2026-11-17' } as StoryPlan;
  const audio = { planId: plan.planId, status: 'DONE' as const, audioUrl: 'https://audio.test/old.mp3' };
  const record = chapterRecording(chapter, plan, audio);
  const result = await freshRecording(record, async () => { throw new Error('Sai endpoint'); }, async (ref, id) => {
    assert.deepEqual(ref, { projectId: chapter.projectId, chapterId: chapter.chapterId, planId: plan.planId });
    assert.equal(id, plan.planId);
    return { ...audio, audioUrl: 'https://audio.test/fresh.mp3' };
  });
  assert.equal(result.audioUrl, 'https://audio.test/fresh.mp3');
  assert.equal(result.storyChapterId, chapter.chapterId);
  assert.equal(result.title, chapter.title);
  await assert.rejects(freshRecording(record, async () => { throw new Error('Sai endpoint'); }, async () => ({ planId: plan.planId, status: 'MISSING' })));
});
