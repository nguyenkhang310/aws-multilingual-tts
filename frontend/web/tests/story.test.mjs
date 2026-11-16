import assert from 'node:assert/strict';
import test from 'node:test';
import { environment } from './environment.mjs';

test('Audio Truyện dùng endpoint ghép chương và lấy lại URL theo plan', async () => {
  const env = await environment();
  try {
    const { storyBatchApi } = await env.load('lib/story-batch-api.ts');
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init.method || 'GET' });
      return { ok: true, json: async () => ({ status: 'DONE', audioUrl: 'https://signed.test/audio' }) };
    };
    const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32) };
    const planId = 'c'.repeat(32);
    assert.equal((await storyBatchApi.chapterAudio(chapter, planId)).status, 'DONE');
    await storyBatchApi.advanceChapterAudio(chapter, planId);
    assert.deepEqual(calls.map(item => item.method), ['GET', 'POST']);
    assert.ok(calls.every(item => item.url.endsWith(`/audio-plans/${planId}/chapter-audio`)));
  } finally { await env.close(); }
});

test('Audio Truyện giữ nội dung dài và dùng upload từng phần', async () => {
  const env = await environment();
  try {
    const { storyApi, storyChunks, checkedBackup, serializeStoryBackup } = await env.load('lib/story-api.ts');
    const { storyTranslationApi } = await env.load('lib/story-translation-api.ts');
    const restoredDrafts = [];
    storyTranslationApi.restoreDraft = async (chapter, draft) => restoredDrafts.push({ chapter, draft });
    const restoredGlossaries = [];
    storyTranslationApi.restoreGlossary = async (projectId, glossary) => restoredGlossaries.push({ projectId, glossary });
    const text = ('Xin chào 😊\n日本語 한글. '.repeat(30000)).slice(0, 500000);
    const parts = storyChunks(text);
    assert.equal(parts.join(''), text);
    assert.ok(parts.length > 10);
    assert.ok(parts.every(part => part.length <= 30000));
    const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), revision: 1 };
    const sent = [];
    globalThis.fetch = async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ...chapter, revision: 2 }) };
    };
    await storyApi.saveText(chapter, text);
    assert.equal(sent.filter(item => item.url.endsWith('/uploads')).length, parts.length);
    assert.equal(sent.at(-1).body.count, parts.length);
    assert.equal(sent.filter(item => item.url.endsWith('/uploads')).map(item => item.body.text).join(''), text);
    assert.throws(() => checkedBackup({ format: 'voxa-story-v1', project: {}, chapters: [] }));
    assert.throws(() => serializeStoryBackup({ text: 'x'.repeat(21 * 1024 * 1024) }), /vượt 20 MiB/);
    const project = { schemaVersion: 1, projectId: 'a'.repeat(32), title: 'Truyện', description: '',
      sourceLang: 'vi-VN', targetLang: 'en-US', chapterCount: 1, version: 1, updatedAt: '2026-11-14', status: 'DRAFT' };
    const metadata = { ...chapter, chapterNumber: 3, title: 'Mở đầu', order: 2, sourceLang: 'vi-VN',
      schemaVersion: 1, revision: 4, textLength: 9, segmentCount: 1, contentRevision: 'c'.repeat(32) };
    const backup = checkedBackup({ format: 'voxa-story-v1', project,
      glossary: { revision: 4, entries: [{ source: 'Nghĩa', target: 'Meaning' }] },
      chapters: [{ metadata, sourceText: 'Xin chào.', segments: [{ order: 0, sourceText: 'Xin chào.', textLength: 9 }] }] });
    const restored = [];
    let importedCast;
    storyApi.createProject = async (_title, _source, _target, _description, cast) => {
      importedCast = cast; return { ...project, projectId: 'd'.repeat(32) };
    };
    storyApi.createChapter = async (projectId, number, title) => ({ ...metadata,
      projectId, chapterNumber: number, title, chapterId: 'e'.repeat(32), order: number, revision: 1 });
    storyApi.updateChapter = async (item, changes) => ({ ...item, ...changes, revision: item.revision + 1 });
    storyApi.saveText = async (item, source, lengths) => { restored.push({ item, source, lengths }); return item; };
    const legacyCast = { schemaVersion: 1, version: 5,
      characters: [{ name: 'Legacy character' }], relations: [] };
    const imported = await storyApi.importProject({ ...backup, cast: legacyCast,
      chapters: [{ ...backup.chapters[0], translationDrafts: [{ targetLang: 'en-US', sourceRevision: 4,
        contentRevision: 'c'.repeat(32), glossaryRevision: 2,
        chunks: [{ sourceText: 'Xin chào.', translated: true, reviewState: 'EDITED', translatedText: 'Hello.' }] }] }] });
    assert.equal(imported.projectId, 'd'.repeat(32));
    assert.equal(restored[0].source, 'Xin chào.');
    assert.equal(restored[0].item.order, 2);
    assert.deepEqual(restored[0].lengths, [9]);
    assert.equal(restoredDrafts[0].draft.chunks[0].translatedText, 'Hello.');
    assert.deepEqual(restoredGlossaries[0].glossary, backup.glossary);
    assert.deepEqual(importedCast, legacyCast);
  } finally { await env.close(); }
});

test('backup exports stored drafts and source refs without live jobs, leases or temporary URLs', async () => {
  const env = await environment();
  try {
    const { storyApi } = await env.load('lib/story-api.ts');
    const { storyTranslationApi } = await env.load('lib/story-translation-api.ts');
    const project = { schemaVersion: 1, projectId: 'a'.repeat(32), title: 'Truyện', description: '',
      sourceLang: 'cmn-CN', targetLang: 'vi-VN', chapterCount: 1, version: 1, updatedAt: '2026-11-16',
      status: 'DRAFT', cast: { characters: [{ name: 'Nhân vật cũ' }], relations: [],
        apiKey: 'do-not-export', claimToken: 'claim-secret', downloadUrl: 'https://signed.test/?X-Amz-Signature=secret' },
      cover: { url: 'https://signed.test/?token=secret', expiresAt: 'soon' } };
    const chapter = { schemaVersion: 1, projectId: project.projectId, chapterId: 'b'.repeat(32),
      chapterNumber: 1, title: 'Chương 1', order: 0, sourceLang: 'cmn-CN', textLength: 9,
      segmentCount: 1, status: 'READY', revision: 3, contentRevision: 'c'.repeat(32), updatedAt: 'today' };
    storyApi.chapters = async () => [chapter];
    storyApi.source = async () => 'Xin chào.';
    storyApi.segments = async () => [{ order: 0, sourceText: 'Xin chào.', textLength: 9,
      revision: 3, status: 'DONE', jobId: 'old-job', audioKey: 'private-audio-key' }];
    storyTranslationApi.approvedOrNull = async () => null;
    storyTranslationApi.plans = async () => ({ items: [{ planId: 'd'.repeat(32), targetLang: 'vi-VN',
      sourceRevision: 3, contentRevision: chapter.contentRevision, glossaryRevision: 8, total: 1 }], nextCursor: null });
    storyTranslationApi.chunk = async () => ({ sourceText: 'Xin chào.', translatedText: 'Hello.', status: 'EDITED' });
    storyTranslationApi.glossary = async () => ({ revision: 8, entries: [] });
    const backup = await storyApi.exportProject(project);
    const serialized = JSON.stringify(backup);
    assert.equal(backup.project.cast.characters[0].name, 'Nhân vật cũ');
    assert.equal('cover' in backup.project, false);
    assert.deepEqual(backup.chapters[0].translationDrafts[0].chunks[0],
      { sourceText: 'Xin chào.', translated: true, reviewState: 'EDITED', translatedText: 'Hello.' });
    assert.equal(backup.chapters[0].segments[0].jobId, null);
    assert.equal(backup.chapters[0].segments[0].audioKey, null);
    assert.equal(serialized.includes('old-job'), false);
    assert.equal(serialized.includes('private-audio-key'), false);
    assert.equal(serialized.includes('signed.test'), false);
    assert.equal(serialized.includes('lease'), false);
    assert.equal(serialized.includes('token=secret'), false);
    assert.equal(serialized.includes('do-not-export'), false);
    assert.equal(serialized.includes('claim-secret'), false);
  } finally { await env.close(); }
});

test('Audio Truyện tải ảnh bìa qua ticket riêng và không đưa URL tạm vào backup', async () => {
  const env = await environment();
  try {
    const { storyApi } = await env.load('lib/story-api.ts');
    const { storyTranslationApi } = await env.load('lib/story-translation-api.ts');
    const project = { schemaVersion: 1, projectId: 'a'.repeat(32), title: 'Truyện', description: '',
      sourceLang: 'vi-VN', targetLang: 'vi-VN', chapterCount: 0, version: 4, updatedAt: '2026-11-15', status: 'DRAFT',
      cover: { url: 'https://signed.test/private?token=temporary', expiresAt: '2026-11-15T01:00:00Z',
        contentType: 'image/png', sizeBytes: 4, width: 2, height: 3, updatedAt: '2026-11-15T00:45:00Z' } };
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      if (url === 'https://tts.test/audiobooks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cover-upload')
        return { ok: true, json: async () => ({ uploadId: 'c'.repeat(32), url: 'https://upload.test',
          fields: { key: 'staging-key', policy: 'signed-policy' }, version: 4 }) };
      if (url === 'https://upload.test') return { ok: true, status: 204 };
      if (url === 'https://tts.test/audiobooks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cover')
        return { ok: true, json: async () => ({ project }) };
      if (url === 'https://tts.test/audiobooks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/glossary')
        return { ok: true, json: async () => ({ revision: 0, entries: [] }) };
      throw new Error(`Unexpected URL ${url}`);
    };
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'cover.png', { type: 'image/png' });
    const saved = await storyApi.uploadCover(project, file);
    assert.equal(saved, project);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), { contentType: 'image/png', sizeBytes: 4, version: 4 });
    assert.equal(calls[1].init.method, 'POST');
    assert.ok(calls[1].init.body instanceof FormData);
    assert.equal(calls[1].init.body.get('key'), 'staging-key');
    assert.equal(calls[1].init.body.get('file').name, 'cover.png');
    assert.equal(calls[2].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[2].init.body), { uploadId: 'c'.repeat(32), version: 4 });
    await assert.rejects(storyApi.uploadCover(project,
      new File(['bad'], 'cover.svg', { type: 'image/svg+xml' })), /JPEG hoặc PNG/);

    storyApi.chapters = async () => [];
    storyTranslationApi.plans = async () => ({ items: [], nextCursor: null });
    const backup = await storyApi.exportProject(project);
    assert.equal('cover' in backup.project, false);
    assert.equal('cast' in backup, false);
    assert.deepEqual(backup.glossary, { revision: 0, entries: [] });
    assert.equal(JSON.stringify(backup).includes('signed.test'), false);
  } finally { await env.close(); }
});
