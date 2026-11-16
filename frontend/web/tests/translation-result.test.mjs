import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, recording } from './environment.mjs';

test('Kết quả dịch: sao chép đúng nội dung, báo lỗi và điều khiển cùng trình phát', async () => {
  const env = await environment();
  const { default: Result } = await env.load('components/TranslationResult.tsx');
  const item = { ...recording(), lang: 'en-US', text: 'First line.\nSecond line.' };
  const notices = [], copied = [];
  let plays = 0;
  const render = (props = {}) => act(() => env.root.render(React.createElement(Result, {
    item, playing: false, onPlay: () => plays++, notify: (...args) => notices.push(args), ...props,
  })));
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => copied.push(text) } });
    await render();
    assert.equal(env.mount.querySelector('h2').textContent, 'Kết quả dịch');
    assert.equal(env.mount.querySelector('p').textContent, item.text);
    const buttons = () => env.mount.querySelectorAll('button');
    await act(async () => { buttons()[0].click(); });
    assert.deepEqual(copied, [item.text]);
    assert.match(buttons()[0].textContent, /Đã sao chép/);
    await act(async () => { buttons()[1].click(); });
    assert.equal(plays, 1);
    await render({ playing: true });
    assert.equal(buttons()[1].textContent, 'Tạm dừng');
    navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    await act(async () => { buttons()[0].click(); });
    assert.match(notices[0][0], /Không sao chép được/);
    assert.equal(notices[0][1], true);
    assert.equal(buttons()[0].textContent, 'Sao chép bản dịch');
    await render({ key: 'next', item: { ...item, jobId: 'next', text: 'New result.' } });
    assert.equal(buttons()[0].textContent, 'Sao chép bản dịch');
    assert.equal(env.mount.querySelector('audio'), null, 'Không thêm trình phát thứ hai');
  } finally { await act(() => env.root.unmount()); await env.close(); }
});

test('Kết quả đã thấy không kéo về đầu; kết quả ngoài vùng nhìn cuộn nhẹ và tôn trọng giảm chuyển động', async () => {
  const env = await environment();
  const { default: Result } = await env.load('components/TranslationResult.tsx');
  const calls = [];
  let top = 120;
  const original = env.win.HTMLElement.prototype.getBoundingClientRect;
  env.win.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList.contains('translation-result') ? { top, bottom: top + 150 } : original.call(this);
  };
  const render = async key => act(async () => {
    env.root.render(React.createElement('main', { className: 'route-view', ref: node => {
      if (!node) return;
      node.scrollTop = 135;
      node.getBoundingClientRect = () => ({ top: 100, bottom: 600 });
      node.scrollTo = value => calls.push(value);
    } }, React.createElement(Result, { key, item: recording(key), playing: false, onPlay() {}, notify() {} })));
    await new Promise(resolve => setTimeout(resolve, 60));
  });
  try {
    await render('visible');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    assert.equal(calls.length, 0);
    top = 50;
    await render('outside');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    assert.deepEqual(calls.at(-1), { top: 85, behavior: 'smooth' });
    document.documentElement.dataset.motion = 'reduced';
    await render('reduced');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    assert.deepEqual(calls.at(-1), { top: 85, behavior: 'instant' });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});
