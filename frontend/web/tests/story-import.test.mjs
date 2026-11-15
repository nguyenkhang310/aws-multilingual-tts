import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, settle } from './environment.mjs';

test('Audio Truyện nhập nhiều file sau khi duyệt thứ tự và báo lỗi lưu', async () => {
  const env = await environment();
  const { storyApi } = await env.load('lib/story-api.ts');
  const { default: StoryImport } = await env.load('views/StoryImport.tsx');
  const project = { projectId: 'a'.repeat(32), sourceLang: 'vi-VN' };
  const saved = [];
  let failSecond = true;
  let updates = 0;
  storyApi.createChapter = async (_id, number, title) => ({ chapterId: number.toString(16).padStart(32, '0'),
    projectId: project.projectId, chapterNumber: number, order: number, title, revision: 1 });
  storyApi.updateChapter = async (item, changes) => {
    assert.equal(item.revision, 1, 'không được lặp PATCH với revision cũ');
    updates++;
    return { ...item, ...changes, revision: 2 };
  };
  storyApi.saveText = async (item, text) => {
    if (item.chapterNumber === 2 && failSecond) { failSecond = false; throw new Error('S3 tạm lỗi'); }
    saved.push({ item, text }); return item;
  };
  try {
    await act(async () => { env.root.render(React.createElement(StoryImport, { project, onImported: () => {} })); await settle(); });
    const input = env.mount.querySelector('input[type="file"]');
    assert.equal(input.hidden, true);
    assert.match(env.mount.querySelector('button.text-button').textContent, /Nhập tệp/);
    const files = [new env.win.File(['Nội dung chương một.'], 'Chapter 1.txt', { type: 'text/plain' }),
      new env.win.File(['Nội dung chương hai 😊'], 'Chapter 2.txt', { type: 'text/plain' })];
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    await act(async () => { input.dispatchEvent(new env.win.Event('change', { bubbles: true })); await settle(); });
    assert.equal(env.mount.querySelectorAll('.story-draft').length, 2);
    const order = env.mount.querySelectorAll('.story-draft')[1].querySelectorAll('input[type="number"]')[1];
    await act(async () => {
      Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, 'value').set.call(order, '5');
      order.dispatchEvent(new env.win.Event('input', { bubbles: true })); await settle();
    });
    const save = () => [...env.mount.querySelectorAll('button')].find(button => button.textContent.includes('Lưu ') && button.textContent.includes('chương'));
    await act(async () => { save().click(); await settle(); });
    assert.equal(saved.length, 1);
    assert.match(env.mount.textContent, /S3 tạm lỗi/);
    await act(async () => { save().click(); await settle(); });
    assert.equal(saved.length, 2);
    assert.equal(saved[1].item.order, 5);
    assert.equal(saved[1].text, 'Nội dung chương hai 😊');
    assert.equal(updates, 1);
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});
