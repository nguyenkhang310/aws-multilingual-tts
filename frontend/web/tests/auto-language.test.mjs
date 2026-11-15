import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, settle } from './environment.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const catalog = [
  { lang: 'vi-VN', voices: [{ id: 'Linh' }], provider: 'azure' },
  { lang: 'en-US', voices: [{ id: 'Joanna' }], provider: 'azure' },
  { lang: 'ja-JP', voices: [{ id: 'Nanami' }], provider: 'azure' },
];

test('Auto Language mặc định, debounce và lựa chọn thủ công', async () => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { useStudio } = await env.load('hooks/useStudio.ts');
  api.voices = async () => catalog;
  api.history = async () => ({ items: [], nextCursor: null });
  let editor;
  function Harness({ target = null }) { editor = useStudio(() => {}, target); return null; }
  try {
    await act(async () => { env.root.render(React.createElement(Harness)); await settle(); });
    assert.equal(editor.autoLanguage, true);
    await act(() => editor.updateText('The story begins today and we read the next chapter together.'));
    await act(async () => pause(380));
    assert.equal(editor.lang, 'en-US');
    assert.equal(editor.voice, 'Joanna');
    assert.equal(editor.languageDetection.status, 'detected');
    await act(() => editor.chooseVoice('en-US', 'Joanna'));
    assert.equal(editor.autoLanguage, false);
    await act(() => editor.updateText('Xin chào, hôm nay chúng ta đọc một câu truyện bằng tiếng Việt.'));
    await act(async () => pause(380));
    assert.equal(editor.lang, 'en-US');
    assert.equal(editor.voice, 'Joanna');

    await act(() => editor.setLang('auto'));
    await act(() => editor.updateText('hello, my name is nghĩa'));
    await act(async () => pause(380));
    assert.equal(editor.lang, 'en-US');
    assert.equal(editor.languageDetection.status, 'detected');

    await act(async () => { env.root.render(React.createElement(Harness, { target: 'en-US' })); await settle(); });
    await act(() => editor.chooseVoice('en-US', 'Joanna'));
    await act(() => editor.setLang('auto'));
    await act(() => editor.updateText('今日は日本語の物語を読みます。'));
    await act(async () => pause(380));
    assert.equal(editor.lang, 'ja-JP');
    assert.equal(editor.voice, 'Joanna');
    await act(() => editor.updateText('The story begins today and we read together.'));
    await act(async () => pause(80));
    await act(() => editor.updateText('Xin chào, hôm nay chúng ta đọc một câu truyện bằng tiếng Việt.'));
    await act(async () => pause(380));
    assert.equal(editor.lang, 'vi-VN');
    assert.equal(editor.languageDetection.language, 'vi-VN');
  } finally { await env.close(); }
});

test('Dán rồi tạo giọng ngay dùng ngôn ngữ mới trong cùng lượt', async () => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { useStudio } = await env.load('hooks/useStudio.ts');
  api.voices = async () => catalog;
  api.history = async () => ({ items: [], nextCursor: null });
  let editor, input, calls = 0;
  api.synthesize = async value => { input = value; calls++; return { jobId: 'paste', status: 'DONE', audioUrl: 'https://audio.test/paste.mp3' }; };
  function Harness() { editor = useStudio(() => {}); return null; }
  try {
    await act(async () => { env.root.render(React.createElement(Harness)); await settle(); });
    await act(() => editor.updateText('hello, my name is nghĩa'));
    await act(async () => { await editor.generate(); });
    assert.equal(input.lang, 'en-US');
    assert.equal(input.voice, 'Joanna');
    assert.equal(calls, 1);
    assert.equal(editor.lang, 'en-US');
    await act(() => editor.updateText('hello, my name is nghĩa!'));
    await act(() => editor.setLang('vi-VN'));
    await act(async () => pause(380));
    assert.equal(editor.lang, 'vi-VN');
    assert.equal(editor.autoLanguage, false);
  } finally { await env.close(); }
});

test('Dịch nhận diện nguồn khi dán ngay và vẫn chờ duyệt bản dịch', async () => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { useStudio } = await env.load('hooks/useStudio.ts');
  api.voices = async () => catalog;
  api.history = async () => ({ items: [], nextCursor: null });
  let editor, preview, submits = 0;
  api.previewTranslation = async (text, source, target) => {
    preview = { text, source, target };
    return { translatedText: 'Xin chào, tôi là Nghĩa.' };
  };
  api.synthesize = async () => { submits++; throw new Error('Không được tạo giọng trước khi duyệt'); };
  function Harness() { editor = useStudio(() => {}, 'vi-VN'); return null; }
  try {
    await act(async () => { env.root.render(React.createElement(Harness)); await settle(); });
    await act(() => editor.updateText('hello, my name is nghĩa'));
    await act(async () => { await editor.generate(); });
    assert.deepEqual(preview, { text: 'hello, my name is nghĩa', source: 'en-US', target: 'vi-VN' });
    assert.equal(submits, 0);
    assert.equal(editor.review?.translation, true);
    assert.equal(editor.lang, 'en-US');
  } finally { await env.close(); }
});
