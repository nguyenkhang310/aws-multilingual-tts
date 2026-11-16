import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, settle } from './environment.mjs';

test('Tiến độ tăng bằng ước tính khi provider đang xử lý và kết thúc đúng 100%', async () => {
  const env = await environment();
  try {
    const { estimatedProgress } = await env.load('components/StoryRunProgress.tsx');
    assert.ok(estimatedProgress(0, true, 1000) > 17 && estimatedProgress(0, true, 1000) < 18);
    assert.ok(estimatedProgress(0, true, 5000) > 60);
    assert.ok(estimatedProgress(40, true, 30000) > 40 && estimatedProgress(40, true, 30000) < 100);
    assert.equal(estimatedProgress(40, false, 30000), 40);
    assert.equal(estimatedProgress(100, true, 30000), 100);
  } finally { await env.close(); }
});

test('Audio Truyện duyệt kế hoạch, start một lần và mở lại tiến độ từ backend', async () => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { storyBatchApi } = await env.load('lib/story-batch-api.ts');
  const { default: StoryAudioView } = await env.load('views/StoryAudio.tsx');
  const { StoryPlaybackContext } = await env.load('hooks/StoryPlayback.tsx');
  const played = [];
  const StoryAudio = props => React.createElement(StoryPlaybackContext.Provider,
    { value: { currentId: null, playing: false, play: async queue => { played.push(queue); } } }, React.createElement(StoryAudioView, props));
  const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), sourceLang: 'vi-VN',
    revision: 2, segmentCount: 2, textLength: 2000 };
  const plan = { planId: 'c'.repeat(32), projectId: chapter.projectId, chapterId: chapter.chapterId,
    sourceChapterRevision: 2, provider: 'azure', voice: 'HoaiMy', speed: 0.9,
    style: 'neutral', styleIntensity: 1, total: 2, totalChars: 2000, createdAt: '2026-11-14' };
  const draft = { planId: plan.planId, status: 'DRAFT', total: 2, totalChars: 2000,
    quotaRemainingEstimate: 30000, queued: 2, claimed: 0, submitted: 0, processing: 0,
    done: 0, failed: 0, blockedQuota: 0, uncertain: 0, percentComplete: 0,
    items: [], nextCursor: null };
  const finished = { ...draft, status: 'DONE', queued: 0, done: 2, percentComplete: 100,
    items: [{ segmentId: 'd'.repeat(32), index: 0, status: 'DONE', jobId: 'job-one',
      audioUrl: 'https://audio.test/one.mp3' }] };
  let created = false, started = 0, latestPlan = plan;
  api.voices = async () => [{ provider: 'azure', lang: 'vi-VN', voices: [
    { id: 'HoaiMy', name: 'Hoài My', styles: ['cheerful'], styleIntensityRange: [0.1, 2] }] }];
  storyBatchApi.plans = async () => ({ items: created ? [latestPlan] : [], nextCursor: null,
    quotaRemainingEstimate: 30000 });
  storyBatchApi.chapterAudio = async () => ({ status: 'NOT_STARTED' });
  storyBatchApi.create = async (_chapter, input) => {
    assert.equal(input.voice, 'HoaiMy');
    assert.equal(input.style, 'cheerful');
    assert.equal(input.styleIntensity, 1.5);
    latestPlan = { ...plan, ...input }; created = true; return latestPlan;
  };
  storyBatchApi.progress = async () => started ? finished : draft;
  storyBatchApi.start = async () => { started++; return finished; };
  env.win.confirm = () => true;
  const render = () => React.createElement(StoryAudio, { chapter, targetLang: 'vi-VN', dirty: false });
  const button = label => [...env.mount.querySelectorAll('button')].find(item => item.textContent === label);
  try {
    await act(async () => { env.root.render(render()); await settle(); });
    assert.match(env.mount.textContent, /30\.000/);
    await act(async () => {
      const style = [...env.mount.querySelectorAll('select')].find(item => item.querySelector('option[value="cheerful"]'));
      style.value = 'cheerful'; style.dispatchEvent(new env.win.Event('change', { bubbles: true }));
      await settle();
    });
    await act(async () => {
      const intensity = env.mount.querySelector('input[type="range"]');
      Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, 'value').set.call(intensity, '1.5');
      intensity.dispatchEvent(new env.win.Event('input', { bubbles: true }));
      await settle();
    });
    await act(async () => { button('Tạo giọng kể').click(); await settle(); });
    assert.match(env.mount.textContent, /2 đoạn · 2\.000 ký tự/);
    assert.equal(started, 1);
    assert.equal(button('Tạo giọng kể').disabled, true);
    assert.equal(env.mount.querySelectorAll('audio').length, 0, 'Chương không tạo trình phát riêng');
    await act(async () => { env.mount.querySelector('[aria-label="Nghe đoạn 1"]').click(); await settle(); });
    assert.equal(played[0][0].jobId, 'job-one');
    await act(async () => { env.root.render(null); await settle(); });
    await act(async () => { env.root.render(render()); await settle(); });
    assert.match(env.mount.textContent, /2\/2 đoạn hoàn tất/);
    assert.equal(started, 1);
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});

test('Audio Truyện báo rõ quota Gemini, cho thử lại chủ động và giữ lỗi khác sau reload', async () => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { storyBatchApi } = await env.load('lib/story-batch-api.ts');
  const { default: StoryAudioView } = await env.load('views/StoryAudio.tsx');
  const { StoryPlaybackContext } = await env.load('hooks/StoryPlayback.tsx');
  const played = [];
  const StoryAudio = props => React.createElement(StoryPlaybackContext.Provider,
    { value: { currentId: null, playing: false, play: async queue => { played.push(queue); } } }, React.createElement(StoryAudioView, props));
  const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), sourceLang: 'vi-VN',
    revision: 2, segmentCount: 4, textLength: 4000 };
  const plan = { planId: 'c'.repeat(32), sourceChapterRevision: 2, translateTo: null,
    total: 4, totalChars: 4000, provider: 'azure',
    voice: 'HoaiMy', speed: 0.9, style: 'neutral', styleIntensity: 1, createdAt: '2026-11-14' };
  api.voices = async () => [{ provider: 'azure', lang: 'vi-VN', voices: [{ id: 'HoaiMy' }] }];
  storyBatchApi.plans = async () => ({ items: [plan], quotaRemainingEstimate: 0 });
  storyBatchApi.chapterAudio = async () => ({ status: 'NOT_STARTED' });
  storyBatchApi.progress = async () => ({ planId: plan.planId, status: 'BLOCKED_QUOTA', total: 4,
    totalChars: 4000, quotaRemainingEstimate: 0, done: 1, processing: 0, queued: 0,
    failed: 1, blockedQuota: 1, uncertain: 1, items: [
      { segmentId: 'd'.repeat(32), index: 0, status: 'FAILED', errorCode: 'GEMINI_TTS_QUOTA', retryable: true },
    ], nextCursor: null });
  try {
    await act(async () => { env.root.render(React.createElement(StoryAudio,
      { chapter, targetLang: 'vi-VN', dirty: false })); await settle(); });
    assert.match(env.mount.textContent, /1Giới hạn/);
    assert.match(env.mount.textContent, /1Lỗi/);
    assert.match(env.mount.textContent, /1Chưa rõ/);
    assert.match(env.mount.textContent, /Gemini đang giới hạn lượt hoặc hết quota/);
    assert.match(env.mount.textContent, /Thử lại đoạn này/);
    assert.equal([...env.mount.querySelectorAll('button')].find(item => item.textContent === 'Tạo giọng kể').disabled, true);
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});

test('Audio Truyện gửi Pause, Resume và Retry từng đoạn tới backend', async () => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { storyBatchApi } = await env.load('lib/story-batch-api.ts');
  const { default: StoryAudioView } = await env.load('views/StoryAudio.tsx');
  const { StoryPlaybackContext } = await env.load('hooks/StoryPlayback.tsx');
  const played = [];
  const StoryAudio = props => React.createElement(StoryPlaybackContext.Provider,
    { value: { currentId: null, playing: false, play: async queue => { played.push(queue); } } }, React.createElement(StoryAudioView, props));
  const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), sourceLang: 'vi-VN',
    chapterNumber: 4, revision: 2, segmentCount: 1, textLength: 20 };
  const plan = { planId: 'c'.repeat(32), sourceChapterRevision: 2, provider: 'azure', voice: 'HoaiMy',
    speed: 0.9, style: 'neutral', styleIntensity: 1, total: 1, totalChars: 20, createdAt: '2026-11-14' };
  const segmentId = 'd'.repeat(32);
  const makeProgress = (status, changes = {}) => ({ planId: plan.planId, status, total: 1, totalChars: 20,
    quotaRemainingEstimate: 1000, queued: status === 'RUNNING' ? 1 : 0, claimed: 0, submitted: 0, processing: 0,
    done: 0, failed: 0, blockedQuota: 0, uncertain: 0, maxAttempts: 3, percentComplete: 0,
    items: [], nextCursor: null, ...changes });
  let current = makeProgress('RUNNING');
  const calls = [];
  api.voices = async () => [{ provider: 'azure', lang: 'vi-VN', voices: [{ id: 'HoaiMy' }] }];
  storyBatchApi.plans = async () => ({ items: [plan], quotaRemainingEstimate: 1000 });
  storyBatchApi.chapterAudio = async () => ({ status: 'NOT_STARTED' });
  storyBatchApi.progress = async () => current;
  storyBatchApi.pause = async () => { calls.push('pause'); current = makeProgress('PAUSED', { desiredState: 'PAUSED', queued: 1 }); return current; };
  storyBatchApi.resume = async () => {
    calls.push('resume');
    current = makeProgress('NEEDS_ATTENTION', { failed: 1, items: [{ segmentId, index: 0, status: 'FAILED',
      attemptCount: 1, retryable: true, nextRetryAt: 0 }] });
    return current;
  };
  storyBatchApi.retry = async (_chapter, _planId, id) => {
    calls.push(`retry:${id}`);
    current = makeProgress('RUNNING', { submitted: 1, queued: 0,
      items: [{ segmentId: id, index: 0, status: 'SUBMITTED', attemptCount: 2 }] });
    return current;
  };
  const click = async label => {
    const button = [...env.mount.querySelectorAll('button')].find(item => item.textContent.trim() === label);
    assert.ok(button, `missing button: ${label}`);
    await act(async () => { button.click(); await settle(); });
  };
  try {
    await act(async () => { env.root.render(React.createElement(StoryAudio, { chapter, targetLang: 'vi-VN', dirty: false })); await settle(); });
    await click('Tạm dừng');
    await click('Tiếp tục');
    await click('Thử lại đoạn này');
    assert.deepEqual(calls, ['pause', 'resume', `retry:${segmentId}`]);
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});

test('truyện nguồn tiếng Trung chọn giọng Việt và gửi yêu cầu dịch trước khi đọc', async () => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { storyBatchApi } = await env.load('lib/story-batch-api.ts');
  const { default: StoryAudioView } = await env.load('views/StoryAudio.tsx');
  const { StoryPlaybackContext } = await env.load('hooks/StoryPlayback.tsx');
  const played = [];
  const StoryAudio = props => React.createElement(StoryPlaybackContext.Provider,
    { value: { currentId: null, playing: false, play: async queue => { played.push(queue); } } }, React.createElement(StoryAudioView, props));
  const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), sourceLang: 'cmn-CN',
    revision: 2, segmentCount: 1, textLength: 100 };
  api.voices = async () => [
    { provider: 'azure', lang: 'cmn-CN', voices: [{ id: 'ChineseVoice' }] },
    { provider: 'azure', lang: 'vi-VN', voices: [
      { id: 'VietnameseVoice', name: 'Hoài My', styles: [] },
      { id: 'ExpressiveVoice', name: 'Giọng biểu cảm', styles: ['cheerful'] }] },
  ];
  storyBatchApi.plans = async () => ({ items: [], quotaRemainingEstimate: 30000 });
  let input;
  storyBatchApi.create = async (_chapter, value) => { input = value; return { planId: 'c'.repeat(32),
    sourceChapterRevision: chapter.revision, translateTo: value.translateTo,
    provider: 'azure', voice: value.voice, speed: value.speed, style: 'neutral', styleIntensity: 1,
    total: 1, totalChars: 100, createdAt: '2026-11-14' }; };
  storyBatchApi.progress = async () => ({ status: 'DRAFT', total: 1, totalChars: 100, quotaRemainingEstimate: 30000, done: 0, items: [] });
  storyBatchApi.start = async () => ({ status: 'RUNNING', total: 1, totalChars: 100,
    quotaRemainingEstimate: 30000, done: 0, items: [] });
  env.win.confirm = () => true;
  try {
    await act(async () => { env.root.render(React.createElement(StoryAudio,
      { chapter, targetLang: 'vi-VN', dirty: false })); await settle(); });
    assert.equal(env.mount.querySelector('[aria-label="Ngôn ngữ đọc"]').value, 'cmn-CN');
    await act(async () => { const select = env.mount.querySelector('[aria-label="Ngôn ngữ đọc"]');
      select.value = 'vi-VN'; select.dispatchEvent(new env.win.Event('change', { bubbles: true })); await settle(); });
    assert.match(env.mount.textContent, /Tiếng Trung giản thể → Tiếng Việt/);
    await act(async () => {
      [...env.mount.querySelectorAll('button')].find(item => item.textContent === 'Tạo giọng kể').click();
      await settle();
    });
    assert.equal(input.voice, 'ExpressiveVoice');
    assert.equal(input.translateTo, 'vi-VN');
  } finally { await act(async () => env.root.unmount()); await env.close(); }
});
