import assert from 'node:assert/strict';
import test from 'node:test';
import { createStoryClient, type StoryRequest } from '../../shared/story-client';
import { storyChunks, type StoryChapter, type StoryProject } from '../../shared/story';

const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), revision: 3, contentRevision: 'old', sourceLang: 'vi-VN' } as StoryChapter;
const client = (handler: (path: string, options?: Parameters<StoryRequest>[1]) => unknown) =>
  createStoryClient(async <T>(path: string, options?: Parameters<StoryRequest>[1]) => handler(path, options) as T,
    () => 'c'.repeat(32), () => false);

test('Shared story client upload preserves UTF-16 chunks then commits the current CAS revision', async () => {
  const calls: { path: string; data: any }[] = [];
  const api = client((path, options) => { calls.push({ path, data: JSON.parse(options?.body ?? '{}') }); return chapter; }).storyApi;
  const text = 'A'.repeat(29999) + '😀' + 'Chương hai.';
  await api.saveText(chapter, text);
  const uploads = calls.filter(item => item.path.endsWith('/uploads'));
  assert.equal(uploads.length, 2);
  assert.equal(uploads.map(item => item.data.text).join(''), text);
  assert.equal(uploads[0].data.text.endsWith('\uD83D'), false);
  assert.equal(calls.at(-1)?.data.revision, 3);
  assert.equal(calls.at(-1)?.data.count, 2);
  assert.equal(calls.some(item => item.path === '/synthesize'), false);
});

test('An interrupted story upload never publishes a partial chapter', async () => {
  const calls: string[] = [];
  const api = client(path => { calls.push(path); if (calls.length === 2) throw new Error('S3 unavailable'); return {}; }).storyApi;
  await assert.rejects(api.saveText(chapter, 'A'.repeat(31000)), /S3 unavailable/);
  assert.equal(calls.some(path => path.endsWith('/commit')), false);
});

test('Changed source revision is rejected instead of combining two versions', async () => {
  const api = client(() => ({ text: 'Nội dung mới', contentRevision: 'new', nextCursor: null })).storyApi;
  await assert.rejects(api.source(chapter), /Chương đã đổi/);
});

test('Story translation edit uses its version, audio plans use chapter revision and explicit source', async () => {
  const calls: { path: string; options: Parameters<StoryRequest>[1] }[] = [];
  const api = client((path, options) => { calls.push({ path, options }); return {}; });
  await api.storyTranslationApi.edit(chapter, 'd'.repeat(32), 1, 'Bản đã duyệt.', 7);
  const controller = new AbortController();
  await api.storyTranslationApi.action(chapter, 'd'.repeat(32), 'tick', controller.signal);
  await api.storyBatchApi.create(chapter, { provider: 'gemini', voice: 'Kore', style: 'cheerful',
    styleIntensity: 1.5, speed: 0.9, textSource: 'approved_translation' });
  assert.deepEqual(JSON.parse(calls[0].options?.body ?? ''), { translatedText: 'Bản đã duyệt.', version: 7 });
  assert.equal(calls[1].options?.signal, controller.signal);
  const plan = JSON.parse(calls[2].options?.body ?? '');
  assert.equal(plan.chapterRevision, 3);
  assert.equal(plan.textSource, 'approved_translation');
  assert.equal(plan.provider, 'gemini');
  assert.equal(plan.styleIntensity, 1.5);
  assert.equal(calls.some(item => item.path === '/synthesize'), false);
});

test('Story backup excludes signed cover URLs and never includes audio bytes', async () => {
  const project = { projectId: chapter.projectId, title: 'Truyện', cover: { url: 'https://private.invalid/secret' } } as StoryProject;
  const api = client(path => path.endsWith('/chapters') || path.includes('/chapters?')
    ? { items: [], nextCursor: null } : { revision: 1, entries: [] }).storyApi;
  const backup = await api.exportProject(project);
  assert.equal('cover' in backup.project, false);
  assert.equal(JSON.stringify(backup).includes('private.invalid'), false);
  assert.equal(backup.format, 'voxa-story-v1');
});

test('Chapter pagination and input caps do not silently truncate text', async () => {
  const calls: string[] = [];
  const api = client(path => { calls.push(path); return calls.length === 1
    ? { items: [chapter], nextCursor: 'page/2' } : { items: [{ ...chapter, chapterId: 'd'.repeat(32) }], nextCursor: null }; }).storyApi;
  assert.equal((await api.chapters(chapter.projectId)).length, 2);
  assert.ok(calls[1].includes('cursor=page%2F2'));
  assert.throws(() => storyChunks('A'.repeat(1_000_001)), /1.000.000/);
  assert.throws(() => storyChunks(''), /cần có chữ/);
});

test('Batch translation stops after cancellation without approving or creating TTS', async () => {
  const { translateStoryChapters } = await import('../../shared/story-translation-run');
  const controller = new AbortController();
  const calls: string[] = [];
  const api = client(path => {
    calls.push(path);
    if (path.endsWith('/glossary')) return { revision: 1, entries: [] };
    if (path.endsWith('/approved-translation')) return null;
    if (path.endsWith('/translation-plans')) { controller.abort(); return { planId: 'd'.repeat(32) }; }
    throw new Error('Unexpected dispatch');
  }).storyTranslationApi;
  await assert.rejects(translateStoryChapters(api, { projectId: chapter.projectId, targetLang: 'en-US' } as StoryProject,
    [chapter], controller.signal, () => {}), /Đã dừng dịch/);
  assert.equal(calls.some(path => /\/start$|\/approve$|\/synthesize$/.test(path)), false);
});

test('Batch translation reuses an approval only for matching source, target and glossary revisions', async () => {
  const { translateStoryChapters } = await import('../../shared/story-translation-run');
  const calls: string[] = [];
  const api = client(path => {
    calls.push(path);
    return path.endsWith('/glossary') ? { revision: 2, entries: [] } : { sourceRevision: 3, glossaryRevision: 2, targetLang: 'en-US' };
  }).storyTranslationApi;
  const count = await translateStoryChapters(api, { projectId: chapter.projectId, targetLang: 'en-US' } as StoryProject,
    [chapter], new AbortController().signal, () => {});
  assert.equal(count, 1);
  assert.equal(calls.length, 2);
});
