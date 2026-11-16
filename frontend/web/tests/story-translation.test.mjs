import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, settle } from './environment.mjs';

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

test('Chuyển phần dịch chờ đúng nội dung mới, giữ bản chỉnh và có đường thử lại khi mất mạng', async () => {
  const env = await environment();
  try {
    const { storyTranslationApi: api } = await env.load('lib/story-translation-api.ts');
    const { default: View } = await env.load('views/StoryTranslation.tsx');
    const chapter = { chapterId: 'b'.repeat(32), projectId: 'a'.repeat(32), revision: 1, sourceLang: 'en-US', contentRevision: 'r1' };
    const plan = { planId: 'c'.repeat(32), total: 2 };
    const progress = { status: 'READY_FOR_REVIEW', total: 2, totalChars: 40, counts: { DONE: 2, EDITED: 0 } };
    let fail = false, pending;
    api.plans = async () => ({ items: [plan] }); api.approvedOrNull = async () => null;
    api.progress = async () => progress;
    api.chunk = async (_chapter, _plan, index) => {
      if (index === 1 && !fail) await new Promise(resolve => { pending = resolve; });
      if (index === 1 && fail) throw new Error('Mất mạng mẫu.');
      return { index, version: 1, status: 'DONE', sourceText: `Source ${index}`, translatedText: `Bản dịch ${index}` };
    };
    const button = text => [...env.mount.querySelectorAll('button')].find(item => item.textContent === text);
    await act(async () => { env.root.render(React.createElement(View, { chapter, targetLang: 'vi-VN', onApproved: () => {} })); await settle(); });
    assert.equal(env.mount.querySelector('textarea').value, 'Bản dịch 0');
    await act(async () => { button('Sau').click(); await settle(); });
    assert.equal(env.mount.querySelector('textarea'), null);
    assert.equal(button('Duyệt bản dịch').disabled, true);
    await act(async () => { pending(); await settle(); });
    assert.equal(env.mount.querySelector('textarea').value, 'Bản dịch 1');
    await act(async () => {
      const field = env.mount.querySelector('textarea');
      Object.getOwnPropertyDescriptor(env.win.HTMLTextAreaElement.prototype, 'value').set.call(field, 'Bản chỉnh riêng');
      field.dispatchEvent(new env.win.Event('input', { bubbles: true })); await settle();
    });
    assert.equal(button('Trước').disabled, true);
    assert.equal(button('Cập nhật kế hoạch dịch').disabled, true);
  } finally { await env.close(); }
});
