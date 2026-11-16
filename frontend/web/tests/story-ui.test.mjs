import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, settle } from './environment.mjs';

test('Lưu metadata thành công rồi lỗi upload vẫn giữ bản nháp và retry đúng revision', async () => {
  const env = await environment();
  const { storyApi } = await env.load('lib/story-api.ts');
  const { default: StoryChapterEditor } = await env.load('views/StoryChapterEditor.tsx');
  const chapter = { projectId: 'a'.repeat(32), chapterId: 'b'.repeat(32), title: 'Tên cũ',
    chapterNumber: 1, order: 1, revision: 1, contentRevision: null,
    segmentCount: 0, textLength: 0, sourceLang: 'vi-VN' };
  const updates = [], saves = [], reported = [];
  let sourceLoads = 0;
  storyApi.source = async () => { sourceLoads++; return 'Nội dung cũ'; };
  storyApi.segmentPage = async () => ({ items: [], nextCursor: null });
  storyApi.updateChapter = async (item, changes) => {
    assert.equal(item.revision, 1);
    updates.push(changes);
    return { ...item, ...changes, revision: 2 };
  };
  storyApi.saveText = async (item, source) => {
    saves.push({ item, source });
    if (saves.length === 1) throw new Error('Upload lỗi');
    assert.equal(item.revision, 2);
    return { ...item, revision: 3, segmentCount: 1 };
  };
  const type = async (element, value) => act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
    element.dispatchEvent(new env.win.Event('input', { bubbles: true })); await settle();
  });
  const save = () => [...env.mount.querySelectorAll('button')].find(item => item.textContent === 'Lưu chương');
  try {
    function Session() {
      const [current, setCurrent] = React.useState(chapter);
      return React.createElement(StoryChapterEditor, { chapter: current, targetLang: 'vi-VN',
        onSaved: item => { reported.push(item); setCurrent(item); }, onClose: () => {} });
    }
    await act(async () => { env.root.render(React.createElement(Session)); await settle(); });
    await type(env.mount.querySelector('input[maxlength="120"]'), 'Tên mới');
    await type(env.mount.querySelector('textarea'), 'Nội dung mới');
    await act(async () => { save().click(); await settle(); });
    assert.match(env.mount.textContent, /Upload lỗi/);
    assert.equal(env.mount.querySelector('textarea').value, 'Nội dung mới');
    assert.equal(reported.length, 0);
    await act(async () => { save().click(); await settle(); });
    assert.equal(updates.length, 1);
    assert.equal(saves.length, 2);
    assert.equal(reported[0].revision, 3);
    assert.equal(sourceLoads, 1);
    assert.equal(env.mount.querySelector('textarea').value, 'Nội dung mới');
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});

test('Audio Truyện tạo và mở lại project/chapter từ backend', async () => {
  const env = await environment();
  const { storyApi } = await env.load('lib/story-api.ts');
  const { default: Audiobooks } = await env.load('views/Audiobooks.tsx');
  const projects = [], chapters = [];
  const renames = [];
  storyApi.projects = async () => [...projects];
  storyApi.project = async () => ({ ...projects[0], chapterCount: chapters.length });
  storyApi.chapters = async () => [...chapters];
  storyApi.createProject = async (title, sourceLang, targetLang) => {
    assert.equal(sourceLang, 'vi-VN');
    assert.equal(targetLang, 'vi-VN');
    const item = { projectId: 'a'.repeat(32), schemaVersion: 1, title, description: '', sourceLang: 'vi-VN',
      targetLang: 'vi-VN', chapterCount: 0, version: 1, updatedAt: '2026-11-14', status: 'DRAFT' };
    projects.push(item); return item;
  };
  storyApi.uploadCover = async (item, file) => {
    assert.equal(file.type, 'image/png');
    const updated = { ...item, version: item.version + 1, cover: { url: 'https://signed.test/cover',
      expiresAt: '2026-11-15T01:00:00Z', contentType: 'image/png', sizeBytes: file.size,
      width: 400, height: 600, updatedAt: '2026-11-15T00:45:00Z' } };
    projects[0] = updated; return updated;
  };
  storyApi.refreshCover = async () => ({ ...projects[0].cover, url: 'https://signed.test/cover-renewed',
    expiresAt: '2026-11-15T02:00:00Z' });
  storyApi.exportProject = async item => ({ format: 'voxa-story-v1', project: item, chapters: [] });
  storyApi.deleteCover = async item => { const updated = { ...item, version: item.version + 1, cover: null };
    projects[0] = updated; return updated; };
  storyApi.renameProject = async (item, title) => {
    renames.push({ item, title });
    projects[0] = { ...item, title, version: item.version + 1 };
    return projects[0];
  };
  storyApi.createChapter = async (_id, chapterNumber, title) => {
    const item = { chapterId: 'b'.repeat(32), projectId: projects[0].projectId, schemaVersion: 1,
      chapterNumber, title, order: chapterNumber, sourceLang: 'vi-VN', textLength: 0, segmentCount: 0,
      status: 'DRAFT', revision: 1, contentRevision: null, updatedAt: '2026-11-14' };
    chapters.push(item); return item;
  };
  storyApi.source = async () => '';
  storyApi.segmentPage = async () => ({ items: [], nextCursor: null });
  const click = async element => { assert.ok(element); await act(async () => { element.click(); await settle(); }); };
  const type = async (element, value) => act(async () => {
    Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new env.win.Event('input', { bubbles: true })); await settle();
  });
  const button = label => [...env.mount.querySelectorAll('button')].find(item => item.textContent.trim() === label);
  const { storyTranslationApi } = await env.load('lib/story-api.ts');
  storyTranslationApi.approvedOrNull = async () => null;
  try {
    await act(async () => { env.root.render(React.createElement(Audiobooks)); await settle(); });
    assert.ok(button('Thêm truyện'));
    assert.equal(env.mount.querySelector('form'), null, 'Thư viện không chứa form đang mở');
    assert.match(env.mount.querySelector('.story-note').textContent, /trước khi kết thúc Lab/);
    await click(button('Thêm truyện'));
    assert.match(env.mount.querySelector('[aria-label="Ngôn ngữ gốc"]').textContent, /Tiếng Việt/);
    await type(env.mount.querySelector('.story-form input'), 'Truyện của tôi');
    await click(button('Tạo truyện'));
    assert.match(env.mount.querySelector('.story-book-heading').textContent, /Truyện của tôi/);
    assert.equal(env.mount.querySelector('dialog'), null, 'Lưu xong đóng form');
    await click(env.mount.querySelector('[aria-label="Tùy chọn truyện"]'));
    await click(button('Đổi tên truyện'));
    await type(env.mount.querySelector('form[aria-label="Đổi tên truyện"] input'), 'Truyện đã đổi tên');
    await click(button('Lưu tên'));
    assert.equal(renames.length, 1);
    assert.equal(renames[0].title, 'Truyện đã đổi tên');
    assert.match(env.mount.querySelector('.story-book-heading').textContent, /Truyện đã đổi tên/);
    const coverInput = env.mount.querySelector('input[type="file"]');
    Object.defineProperty(coverInput, 'files', { configurable: true, value: [new File(['png'], 'cover.png', { type: 'image/png' })] });
    await act(async () => { coverInput.dispatchEvent(new env.win.Event('change', { bubbles: true })); await settle(); });
    const img = () => env.mount.querySelector('.story-book-heading img');
    assert.equal(img()?.getAttribute('src'), 'https://signed.test/cover');
    await act(async () => { img().dispatchEvent(new env.win.Event('error')); await settle(); });
    assert.equal(img()?.getAttribute('src'), 'https://signed.test/cover-renewed');
    await act(async () => { img().dispatchEvent(new env.win.Event('error')); await settle(); });
    assert.equal(img(), null, 'Link lỗi hai lần hiện bìa thay thế, không tải lặp');
    await click(button('Xóa ảnh bìa'));
    await click(env.mount.querySelector('[aria-label="Đóng cửa sổ"]'));
    await click(button('Viết chương'));
    const inputs = env.mount.querySelectorAll('.story-form input');
    await type(inputs[0], 'Mở đầu');
    await type(inputs[1], '0');
    assert.equal(button('Thêm chương').disabled, true);
    await type(inputs[1], '1');
    await click(button('Thêm chương'));
    assert.ok(env.mount.querySelector('.story-editor'));
    assert.equal(env.mount.querySelector('.story-book-heading'), null, 'Trình sửa là một màn riêng');
    await click(button('Đóng'));
    assert.match(env.mount.querySelector('.story-chapters').textContent, /Mở đầu/);
    await act(async () => { env.root.render(null); await settle(); });
    await act(async () => { env.root.render(React.createElement(Audiobooks)); await settle(); });
    await click(env.mount.querySelector('.story-book'));
    assert.match(env.mount.querySelector('.story-chapters').textContent, /Mở đầu/);
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});


test('Phản hồi tải truyện muộn không mở lại màn đã đóng', async () => {
  const env = await environment();
  const { storyApi } = await env.load('lib/story-api.ts');
  const { default: Audiobooks } = await env.load('views/Audiobooks.tsx');
  const book = { projectId: 'c'.repeat(32), title: 'Truyện tải chậm', sourceLang: 'vi-VN', targetLang: 'vi-VN', chapterCount: 0 };
  let resolve;
  storyApi.projects = async () => [book];
  storyApi.project = () => new Promise(done => { resolve = done; });
  storyApi.chapters = async () => [];
  const button = label => [...env.mount.querySelectorAll('button')].find(item => item.textContent.trim() === label);
  try {
    await act(async () => { env.root.render(React.createElement(Audiobooks)); await settle(); });
    await act(async () => { env.mount.querySelector('.story-book').click(); await settle(); });
    assert.ok(env.mount.querySelector('.story-book-heading'));
    await act(async () => { button('Thư viện truyện').click(); await settle(); });
    await act(async () => { resolve(book); await settle(); });
    assert.equal(env.mount.querySelector('.story-book-heading'), null);
    assert.ok(env.mount.querySelector('.story-book'));
    storyApi.project = async () => book;
    await act(async () => { env.mount.querySelector('.story-book').click(); await settle(); });
    assert.match(env.mount.querySelector('.story-book-heading').textContent, /Truyện tải chậm/);
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});
