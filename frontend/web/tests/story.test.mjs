import assert from 'node:assert/strict';
import test from 'node:test';
import { environment } from './environment.mjs';

test('Audio Truyện giữ nội dung dài và dùng upload từng phần', async () => {
  const env = await environment();
  try {
    const { storyApi, storyChunks, checkedBackup } = await env.load('lib/story-api.ts');
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
    const project = { schemaVersion: 1, projectId: 'a'.repeat(32), title: 'Truyện', description: '',
      sourceLang: 'vi-VN', targetLang: 'en-US', chapterCount: 1, version: 1, updatedAt: '2026-11-14', status: 'DRAFT' };
    const metadata = { ...chapter, chapterNumber: 3, title: 'Mở đầu', order: 2, sourceLang: 'vi-VN',
      schemaVersion: 1, revision: 4, textLength: 9, segmentCount: 1, contentRevision: 'c'.repeat(32) };
    const backup = checkedBackup({ format: 'voxa-story-v1', project,
      chapters: [{ metadata, sourceText: 'Xin chào.', segments: [{ order: 0, sourceText: 'Xin chào.', textLength: 9 }] }] });
    const restored = [];
    storyApi.createProject = async () => ({ ...project, projectId: 'd'.repeat(32) });
    storyApi.createChapter = async (projectId, number, title) => ({ ...metadata,
      projectId, chapterNumber: number, title, chapterId: 'e'.repeat(32), order: number, revision: 1 });
    storyApi.updateChapter = async (item, changes) => ({ ...item, ...changes, revision: item.revision + 1 });
    storyApi.saveText = async (item, source, lengths) => { restored.push({ item, source, lengths }); return item; };
    const imported = await storyApi.importProject({ ...backup, cast: { schemaVersion: 1, version: 5,
      characters: [{ name: 'Legacy character' }], relations: [] } });
    assert.equal(imported.projectId, 'd'.repeat(32));
    assert.equal(restored[0].source, 'Xin chào.');
    assert.equal(restored[0].item.order, 2);
    assert.deepEqual(restored[0].lengths, [9]);
  } finally { await env.close(); }
});

test('Audio Truyện tải ảnh bìa qua ticket riêng và không đưa URL tạm vào backup', async () => {
  const env = await environment();
  try {
    const { storyApi } = await env.load('lib/story-api.ts');
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
    const backup = await storyApi.exportProject(project);
    assert.equal('cover' in backup.project, false);
    assert.equal('cast' in backup, false);
    assert.deepEqual(backup.glossary, { revision: 0, entries: [] });
    assert.equal(JSON.stringify(backup).includes('signed.test'), false);
  } finally { await env.close(); }
});
