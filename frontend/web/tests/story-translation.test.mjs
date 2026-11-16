import assert from 'node:assert/strict';
import test from 'node:test';
import { environment } from './environment.mjs';

test('bản dịch chưa duyệt được coi là trạng thái rỗng; lỗi máy chủ vẫn được báo', async () => {
  const env = await environment();
  try {
    const { storyTranslationApi } = await env.load('lib/story-translation-api.ts');
    const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32) };
    globalThis.fetch = async () => ({ ok: false, status: 404,
      json: async () => ({ error: { code: 'TRANSLATION_NOT_APPROVED', message: 'Chưa duyệt.' } }) });
    assert.equal(await storyTranslationApi.approvedOrNull(chapter), null);
    globalThis.fetch = async () => ({ ok: false, status: 503,
      json: async () => ({ error: { code: 'STORAGE_UNAVAILABLE', message: 'S3 đang lỗi.' } }) });
    await assert.rejects(storyTranslationApi.approvedOrNull(chapter), /S3 đang lỗi/);
  } finally { await env.close(); }
});
