import assert from 'node:assert/strict';
import test from 'node:test';
import { setDemoToken } from '../src/lib/api';
import { storyApi } from '../src/lib/story-api';
import { storyBatchApi } from '../src/lib/story-batch-api';
import type { StoryProject } from '../../shared/story';

test('App Audio Truyện gọi cùng backend để tạo project và chapter', async () => {
  setDemoToken('fixture-token');
  const calls: { url: string; method: string; body: any; key?: string }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null,
      key: (init.headers as Record<string, string>)?.['Idempotency-Key'] });
    const body = calls.length === 1 ? { projectId: 'a'.repeat(32) } : { chapterId: 'b'.repeat(32) };
    return { ok: true, json: async () => body } as Response;
  }) as typeof fetch;
  try {
    const project = await storyApi.createProject('Truyện', 'vi-VN', 'en-US');
    const chapter = await storyApi.createChapter(project.projectId, 3, 'Mở đầu');
    assert.equal(chapter.chapterId, 'b'.repeat(32));
    assert.equal(calls[0].url.endsWith('/audiobooks'), true);
    assert.equal(calls[1].url.endsWith(`/audiobooks/${project.projectId}/chapters`), true);
    assert.equal(calls[1].body.chapterNumber, 3);
    assert.ok(calls.every(call => call.key && call.key.length >= 8));
    assert.notEqual(calls[0].key, calls[1].key);
  } finally { globalThis.fetch = previous; setDemoToken(''); }
});

test('App Audio Truyện tải ảnh riêng, xác nhận metadata và từ chối file vượt giới hạn', async () => {
  setDemoToken('fixture-token');
  const previousFetch = globalThis.fetch;
  const previousFormData = globalThis.FormData;
  const calls: { url: string; method: string; headers?: HeadersInit; body?: any }[] = [];
  class FormDataFixture {
    values = new Map<string, unknown>();
    append(name: string, value: unknown) { this.values.set(name, value); }
    get(name: string) { return this.values.get(name); }
  }
  globalThis.FormData = FormDataFixture as unknown as typeof FormData;
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', headers: init?.headers, body: init?.body });
    if (url === 'https://upload.test') return { ok: true, status: 204 } as Response;
    return { ok: true, json: async () => calls.length === 1
      ? { uploadId: 'c'.repeat(32), url: 'https://upload.test', fields: { key: 'staging-key', policy: 'signed' }, version: 2 }
      : { project: { projectId: 'a'.repeat(32), version: 3, cover: { url: 'https://signed.test/cover' } } } } as Response;
  }) as typeof fetch;
  try {
    const project = { projectId: 'a'.repeat(32), version: 2 } as StoryProject;
    const asset = { uri: 'file:///cover.png', fileName: 'cover.png', fileSize: 2048, mimeType: 'image/png' };
    const saved = await storyApi.uploadCover(project, asset);
    assert.equal(saved.version, 3);
    assert.equal(calls[0].url.endsWith('/cover-upload'), true);
    assert.equal(calls[1].url, 'https://upload.test');
    assert.equal((calls[1].body as FormDataFixture).get('file') &&
      ((calls[1].body as FormDataFixture).get('file') as { uri: string }).uri, asset.uri);
    assert.equal(calls[2].url.endsWith('/cover'), true);
    assert.equal(calls[2].method, 'POST');
    assert.match(String((calls[0].headers as Record<string, string>)['X-Demo-Token']), /fixture-token/);
    await assert.rejects(storyApi.uploadCover(project,
      { ...asset, fileSize: 6 * 1024 * 1024 }), /tối đa 5 MiB/);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.FormData = previousFormData;
    setDemoToken('');
  }
});

test('App Audio Truyện xem kế hoạch, start và đọc tiến độ đã lưu', async () => {
  setDemoToken('fixture-token');
  const previous = globalThis.fetch;
  const calls: { url: string; method: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET' });
    return { ok: true, json: async () => calls.length === 1
      ? { items: [{ planId: 'c'.repeat(32) }], nextCursor: null }
      : { planId: 'c'.repeat(32), status: 'RUNNING', done: 1, total: 2 } } as Response;
  }) as typeof fetch;
  try {
    const item = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32) } as Parameters<typeof storyBatchApi.plans>[0];
    const list = await storyBatchApi.plans(item);
    await storyBatchApi.start(item, list.items[0].planId);
    const progress = await storyBatchApi.progress(item, list.items[0].planId);
    assert.equal(progress.done, 1);
    assert.equal(calls[0].url.endsWith('/audio-plans?limit=50'), true);
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[2].url.includes('audio-progress?planId='), true);
  } finally { globalThis.fetch = previous; setDemoToken(''); }
});

test('App Audio Truyện pause, resume và retry gửi đúng thao tác theo chương', async () => {
  setDemoToken('fixture-token');
  const previous = globalThis.fetch;
  const calls: { url: string; method: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET' });
    return { ok: true, json: async () => ({ status: 'RUNNING', items: [] }) } as Response;
  }) as typeof fetch;
  try {
    const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32) } as Parameters<typeof storyBatchApi.pause>[0];
    const planId = 'c'.repeat(32), segmentId = 'd'.repeat(32);
    await storyBatchApi.pause(chapter, planId);
    await storyBatchApi.resume(chapter, planId);
    await storyBatchApi.retry(chapter, planId, segmentId);
    assert.deepEqual(calls.map(call => [call.method, call.url.slice(call.url.indexOf('/chapters/'))]), [
      ['POST', `/chapters/${chapter.chapterId}/audio-plans/${planId}/pause`],
      ['POST', `/chapters/${chapter.chapterId}/audio-plans/${planId}/resume`],
      ['POST', `/chapters/${chapter.chapterId}/audio-plans/${planId}/segments/${segmentId}/retry`],
    ]);
  } finally { globalThis.fetch = previous; setDemoToken(''); }
});
