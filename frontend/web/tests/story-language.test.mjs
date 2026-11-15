import assert from 'node:assert/strict';
import test from 'node:test';
import { environment } from './environment.mjs';
import React, { act } from 'react';
import { settle } from './environment.mjs';

test('project Audio Truyện lưu trạng thái chờ, xác nhận nguồn và giữ backup', async () => {
  const env = await environment();
  const { storyApi, checkedBackup } = await env.load('lib/story-api.ts');
  const calls = [];
  const id = 'a'.repeat(32);
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: init.method, body });
    return { ok: true, json: async () => ({ projectId: id, schemaVersion: 1, title: 'Truyện',
      description: '', sourceLang: body.sourceLang, targetLang: 'vi-VN', version: calls.length,
      chapterCount: 0, updatedAt: '2026-11-14', status: 'DRAFT' }) };
  };
  try {
    const pending = await storyApi.createProject('Truyện', 'und', 'vi-VN');
    assert.equal(calls[0].body.sourceLang, 'und');
    const confirmed = await storyApi.updateProjectLanguage(pending, 'ja-JP');
    assert.deepEqual(calls[1].body, { version: 1, sourceLang: 'ja-JP' });
    assert.equal(confirmed.sourceLang, 'ja-JP');
    const backup = checkedBackup({ format: 'voxa-story-v1', project: confirmed, chapters: [] });
    assert.equal(backup.project.sourceLang, 'ja-JP');
  } finally { await env.close(); }
});

test('chương đầu phải xác nhận ngôn ngữ trước khi cập nhật project', async () => {
  const env = await environment();
  const { storyApi } = await env.load('lib/story-api.ts');
  const { default: StoryImport } = await env.load('views/StoryImport.tsx');
  const project = { projectId: 'a'.repeat(32), sourceLang: 'und', version: 1 };
  const events = [];
  storyApi.updateProjectLanguage = async (_item, lang) => {
    events.push(['project', lang]); return { ...project, sourceLang: lang, version: 2 };
  };
  storyApi.createChapter = async (_id, number, title) => {
    events.push(['chapter', number]);
    return { projectId: project.projectId, chapterId: 'b'.repeat(32), chapterNumber: number,
      title, order: number, revision: 1 };
  };
  storyApi.saveText = async (item, text) => { events.push(['text', text.length]); return item; };
  try {
    await act(async () => { env.root.render(React.createElement(StoryImport, {
      project, onImported: () => {}, onProjectUpdated: () => {},
    })); await settle(); });
    const file = new env.win.File(['Xin chào, hôm nay chúng ta đọc một câu truyện bằng tiếng Việt.'],
      'Chapter 1.txt', { type: 'text/plain' });
    const input = env.mount.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new env.win.Event('change', { bubbles: true })); await settle(); });
    const save = () => [...env.mount.querySelectorAll('button')].find(button => button.textContent.includes('Lưu 1 chương'));
    assert.equal(save().disabled, true);
    assert.match(env.mount.textContent, /Dự đoán: Tiếng Việt/);
    const confirm = [...env.mount.querySelectorAll('button')].find(button => button.textContent.includes('Xác nhận ngôn ngữ'));
    await act(async () => { confirm.click(); await settle(); });
    assert.equal(save().disabled, false);
    await act(async () => { save().click(); await settle(); });
    assert.deepEqual(events.map(item => item[0]), ['project', 'chapter', 'text']);
    assert.equal(events[0][1], 'vi-VN');
  } finally { await act(async () => env.root.unmount()); await env.close(); }
});
