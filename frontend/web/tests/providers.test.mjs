import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, recording, settle } from './environment.mjs';

test('Đổi Azure/Gemini giữ nháp, chọn đúng giọng và không gửi cấu hình cũ', async suite => {
  const env = await environment();
  const { api, saveDemoToken } = await env.load('lib/api.ts');
  const { useStudio } = await env.load('hooks/useStudio.ts');
  let studio, submitted = [], revision = 0;
  const languages = [
    { lang: 'vi-VN', provider: 'azure', engine: null, voices: [{ id: 'HoaiMy', gender: 'F' }] },
    { lang: 'en-US', provider: 'azure', engine: null, translationEnabled: true, voices: [{ id: 'Jenny', gender: 'F', styles: ['cheerful'] }] },
    { lang: 'vi-VN', provider: 'gemini', engine: 'gemini-3.8-flash-tts', available: true, autoEmotionEnabled: true, voices: [{ id: 'Kore', gender: 'N', styles: ['cheerful', 'whispering'] }] },
    { lang: 'en-US', provider: 'gemini', engine: 'gemini-3.8-flash-tts', available: true, translationEnabled: true, voices: [{ id: 'Kore', gender: 'N', styles: ['cheerful'] }] },
    { lang: 'th-TH', provider: 'gemini', engine: 'gemini-3.8-flash-tts', available: true, autoEmotionEnabled: true, voices: [{ id: 'Kore', gender: 'N', styles: ['cheerful'] }] },
  ];
  function Harness({ target }) { studio = useStudio(() => {}, target); return null; }
  async function mount(catalog = languages, target = null) {
    submitted = []; api.voices = async () => catalog; api.history = async () => ({ items: [], nextCursor: null });
    api.correct = async text => ({ status: 'skipped', originalText: text, correctedText: text, hasTypos: false });
    api.synthesize = async input => { submitted.push(input); return { ...recording(), provider: input.provider, engine: input.provider === 'gemini' ? 'gemini-3.8-flash-tts' : null }; };
    await act(async () => { env.root.render(React.createElement(Harness, { key: ++revision, target })); await settle(); });
    await act(() => studio.updateText('Nội dung tiếng Việt được giữ nguyên.'));
  }
  try {
    await suite.test('đổi mã trong phiên bỏ lịch sử đến muộn, giữ bản nháp mà không tải trang', async () => {
      await mount();
      let release;
      api.history = () => new Promise(resolve => { release = resolve; });
      let old;
      await act(async () => { old = studio.loadHistory(); await settle(); });
      api.history = async () => ({ items: [recording('new-session')], nextCursor: null });
      await act(async () => { saveDemoToken('fixture-new-session'); await studio.reconnect(); });
      await act(async () => { release({ items: [recording('old-session')], nextCursor: null }); await old; });
      assert.deepEqual(studio.history.map(item => item.jobId), ['new-session']);
      assert.equal(studio.text, 'Nội dung tiếng Việt được giữ nguyên.');
      assert.equal(studio.currentAudio, null);
    });
    await suite.test('lọc 2 provider, đổi nguồn giữ nháp và gửi Gemini emotion vào đúng body', async () => {
      await mount(); assert.equal(studio.languages.length, 2); assert.equal(studio.voice, 'HoaiMy');
      await act(() => studio.setProvider('gemini'));
      assert.equal(studio.languages.length, 3); assert.equal(studio.voice, 'Kore');
      assert.equal(studio.text, 'Nội dung tiếng Việt được giữ nguyên.');
      await act(() => studio.setStyle('auto'));
      await act(async () => { await studio.generate(); });
      assert.equal(submitted[0].provider, 'gemini'); assert.equal(submitted[0].style, 'auto');
      await act(() => studio.setProvider('azure'));
      assert.equal(studio.voice, 'HoaiMy'); assert.equal(studio.style, 'neutral');
      await act(async () => { await studio.generate(); });
      assert.equal(submitted[1].provider, undefined); assert.equal(submitted[1].style, undefined);
    });
    await suite.test('Gemini chưa bật không gửi job dù có catalog để xem', async () => {
      await mount(languages.map(l => l.provider === 'gemini' ? { ...l, available: false } : l));
      await act(() => studio.setProvider('gemini'));
      await act(async () => { await studio.generate(); await studio.generateAll(); });
      assert.match(studio.error, /Chưa bật Gemini/); assert.equal(submitted.length, 0);
    });
    await suite.test('đổi nguồn lúc kiểm chữ bỏ phản hồi đến muộn, không đọc với provider cũ', async () => {
      await mount(); let resolve;
      await act(() => studio.setCheckSpelling(true));
      api.correct = () => new Promise(done => { resolve = done; });
      let generation;
      await act(async () => { generation = studio.generate(); await settle(); });
      await act(() => studio.setProvider('gemini'));
      await act(async () => { resolve({ status: 'skipped', hasTypos: false, originalText: studio.text, correctedText: studio.text }); await generation; });
      assert.equal(submitted.length, 0); assert.equal(studio.busy, false); assert.equal(studio.review, null);
    });
    await suite.test('chọn đúng provider, không trộn giọng của nguồn khác cùng ngôn ngữ', async () => {
      await mount([...languages, { lang: 'en-US', provider: 'elevenlabs', engine: null, voices: [{ id: 'Other', gender: 'M' }] }]);
      assert.ok(studio.languages.every(item => item.provider === 'azure'));
      await act(() => studio.setProvider('elevenlabs'));
      assert.deepEqual(studio.languages.map(item => item.voices[0].id), ['Other']);
    });
    await suite.test('đổi nguồn TTS giữ ngôn ngữ gốc, giọng đích, OCR và bản dịch đã tải', async () => {
      await mount(languages, 'en-US');
      const previews = [];
      api.previewTranslation = async (text, source, target) => { previews.push({ source, target }); return { translatedText: 'Hello.' }; };
      api.translate = async () => { throw new Error('Không đổi nguồn dịch'); };
      await act(() => studio.setProvider('gemini'));
      await act(() => { studio.setLang('th-TH'); studio.setStyle('cheerful'); studio.setStyleIntensity(1.8); });
      await act(() => studio.setProvider('azure'));
      assert.equal(studio.lang, 'th-TH'); assert.equal(studio.voice, 'Jenny');
      assert.equal(studio.style, 'neutral'); assert.equal(studio.styleIntensity, 1);
      assert.equal(studio.documentMode, 'gemini');
      await act(() => studio.chooseVoice('en-US', 'Jenny'));
      assert.equal(studio.lang, 'th-TH', 'Chọn giọng đích không đổi ngôn ngữ gốc');
      await act(async () => { await studio.generate(); });
      assert.deepEqual(previews, [{ source: 'th-TH', target: 'en-US' }]);
      await act(() => studio.setProvider('gemini'));
      assert.equal(studio.review, null, 'Bỏ bản duyệt gắn với giọng cũ');
      await act(async () => { await studio.generate(); await studio.resolveReview('Hello.'); });
      assert.equal(previews.length, 1, 'Đổi TTS không gọi dịch lại');
      assert.equal(submitted[0].provider, 'gemini'); assert.equal(submitted[0].voice, 'Kore');
      assert.equal(submitted[0].lang, 'en-US'); assert.equal(submitted[0].translateTo, null);
    });
    await suite.test('401 Translator hiện đúng lỗi, không đổi sang dịch Gemini hoặc tạo MP3', async () => {
      await mount(languages, 'en-US');
      await act(() => studio.setLang('vi-VN'));
      await act(() => studio.setProvider('gemini'));
      api.previewTranslation = async () => { throw new Error('Azure Translator chưa xác thực được (HTTP 401). Kiểm tra key và vùng của resource Translator.'); };
      api.translate = async () => { throw new Error('Không fallback'); };
      await act(async () => { await studio.generate(); });
      assert.match(studio.error, /Azure Translator.*401/);
      assert.equal(studio.review, null); assert.equal(studio.busy, false); assert.equal(submitted.length, 0);
      assert.equal(studio.text, 'Nội dung tiếng Việt được giữ nguyên.');
    });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});
