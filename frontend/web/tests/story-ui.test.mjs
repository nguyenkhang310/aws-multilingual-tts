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
  storyApi.source = async () => 'Nội dung cũ';
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
    await act(async () => { env.root.render(React.createElement(StoryChapterEditor,
      { chapter, targetLang: 'vi-VN', onSaved: item => reported.push(item), onClose: () => {} })); await settle(); });
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
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});

test('Audio Truyện tạo và mở lại project/chapter từ backend', async () => {
  const env = await environment();
  const { storyApi } = await env.load('lib/story-api.ts');
  const { default: Audiobooks } = await env.load('views/Audiobooks.tsx');
  const projects = [], chapters = [];
  let sidebarChapters = [], sidebarTitle = null;
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
  try {
    await act(async () => { env.root.render(React.createElement(Audiobooks,
      { onChaptersChange: items => { sidebarChapters = items; },
        onProjectChange: title => { sidebarTitle = title; } })); await settle(); });
    assert.match(env.mount.querySelector('[aria-label="Ngôn ngữ gốc"]').textContent, /Tiếng Việt/);
    assert.match(env.mount.querySelector('[aria-label="Ngôn ngữ đích"]').textContent, /Tiếng Việt/);
    assert.ok(env.mount.querySelector('.story-restore'));
    assert.ok(env.mount.querySelector('.story-cover-select'), 'form tạo dự án có ô ảnh bìa tùy chọn');
    assert.match(env.mount.querySelector('.story-note').textContent, /backup trước khi kết thúc Lab/);
    assert.equal(button('Nhập tệp'), undefined);
    assert.doesNotMatch(env.mount.textContent, /Dữ liệu nằm ở backend/);
    await type(env.mount.querySelector('.story-fields input'), 'Truyện của tôi');
    await click(button('Tạo truyện'));
    assert.equal(sidebarTitle, 'Truyện của tôi');
    assert.match(env.mount.textContent, /Truyện của tôi/);
    assert.match(env.mount.querySelector('.story-project-subtitle').textContent, /Tiếng Việt → Tiếng Việt/);
    assert.ok(env.mount.querySelector('.story-cover-thumb'), 'danh sách có khung thumbnail/placeholder');
    assert.ok(env.mount.querySelector('.story-cover-large'), 'chi tiết có khung ảnh bìa lớn');
    assert.ok(button('Thêm ảnh bìa'));
    const coverInput = [...env.mount.querySelectorAll('input[type="file"]')].find(input => input.accept.includes('image/png') &&
      input.closest('.story-cover-detail'));
    Object.defineProperty(coverInput, 'files', { configurable: true, value: [new File(['png'], 'cover.png', { type: 'image/png' })] });
    await act(async () => { coverInput.dispatchEvent(new env.win.Event('change', { bubbles: true })); await settle(); });
    assert.equal(env.mount.querySelector('.story-cover-thumb img')?.getAttribute('src'), 'https://signed.test/cover');
    assert.equal(env.mount.querySelector('.story-cover-large img')?.getAttribute('src'), 'https://signed.test/cover');
    const imageError = [...env.mount.querySelectorAll('.story-cover-thumb img')][0];
    await act(async () => { imageError.dispatchEvent(new env.win.Event('error')); await settle(); });
    assert.equal(env.mount.querySelector('.story-cover-thumb img')?.getAttribute('src'), 'https://signed.test/cover-renewed');
    const warnings = [];
    env.win.confirm = message => { warnings.push(String(message)); return false; };
    await click(button('Xuất backup'));
    assert.match(warnings[0], /Ảnh bìa không nằm trong file backup/);
    env.win.confirm = () => true;
    await act(async () => { env.mount.querySelector('.story-cover-large img').dispatchEvent(new env.win.Event('error')); await settle(); });
    assert.equal(env.mount.querySelector('.story-cover-large img'), null, 'URL hỏng sau lần gia hạn hiện placeholder, không gọi lặp');
    await click(button('Xóa ảnh bìa'));
    assert.ok(button('Nhập tệp'), 'chỉ hiện nút nhập chương sau khi chọn dự án');
    const fields = env.mount.querySelectorAll('.story-fields');
    await type(fields[1].querySelectorAll('input')[1], 'Mở đầu');
    await click(button('Thêm chương'));
    assert.match(env.mount.textContent, /Mở đầu/);
    assert.ok(env.mount.querySelector('.story-editor'));
    assert.ok(env.mount.querySelector('.story-audio-workspace'));
    assert.match(env.mount.querySelector('.story-editor summary').textContent, /Thay đổi ngôn ngữ nguồn/);
    assert.equal(env.mount.querySelector('.story-chapter-list'), null);
    assert.equal(env.mount.querySelector('[aria-label="Nhân vật và quan hệ"]'), null);
    await act(async () => { env.root.render(null); await settle(); });
    await act(async () => { env.root.render(React.createElement(Audiobooks,
      { onChaptersChange: items => { sidebarChapters = items; },
        onProjectChange: title => { sidebarTitle = title; } })); await settle(); });
    const projectButton = [...env.mount.querySelectorAll('.story-list button')].find(item => item.textContent.includes('Truyện của tôi'));
    await click(projectButton);
    assert.equal(sidebarChapters[0].title, 'Mở đầu');
    assert.equal(sidebarTitle, 'Truyện của tôi');
  } finally { await act(async () => { env.root.unmount(); }); await env.close(); }
});
