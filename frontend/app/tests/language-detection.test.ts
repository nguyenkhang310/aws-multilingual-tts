import assert from 'node:assert/strict';
import test from 'node:test';
import { detectLanguage } from '../src/lib/language-detection';
import { languageCases } from '../../shared/language-evaluation';

const cases: [string, string | null, string][] = [
  ['Xin chào, hôm nay chúng ta cùng đọc một câu truyện bằng tiếng Việt.', 'vi-VN', 'detected'],
  ['xin chèo, hom nay chún ta se ăn gì', 'vi-VN', 'detected'],
  ['xin chao hom nay chung ta se doc mot cau truyen', 'vi-VN', 'detected'],
  ['The story begins today and we read the next chapter with you.', 'en-US', 'detected'],
  ['hello, my name is nghĩa', 'en-US', 'detected'],
  ['xin chào, tôi là nghĩa', 'vi-VN', 'detected'],
  ['My friend Nguyễn Văn A is here.', 'en-US', 'detected'],
  ['Xin chào, tôi thích Python.', 'vi-VN', 'detected'],
  ['こんにちは、元気ですか？', 'ja-JP', 'detected'],
  ['안녕하세요. 반갑습니다.', 'ko-KR', 'detected'],
  ['你好，今天怎么样？', 'cmn-CN', 'detected'],
  ['你好', null, 'uncertain'],
  ['The story begins today and chúng tôi đọc truyện này.', null, 'mixed'],
  ['这是一个中国故事，我们在这里读书。', 'cmn-CN', 'detected'],
  ['這是一個中國故事，我們在這裡讀書。', 'zh-TW', 'detected'],
  ['今日は日本語の物語を読みます。', 'ja-JP', 'detected'],
  ['오늘은 한국어로 이야기를 읽습니다.', 'ko-KR', 'detected'],
  ['日本中国文化', null, 'uncertain'],
  ['1234 https://example.com 😊', null, 'uncertain'],
  ['', null, 'unknown'],
  ['Hi 😊', null, 'uncertain'],
  ['日本語の物語です。 The story begins today and we read another chapter together.', null, 'mixed'],
];

for (const [input, language, status] of cases) {
  test(`offline language detection: ${status} ${language ?? ''}`, async () => {
    const found = await detectLanguage(input);
    assert.deepEqual([found.language, found.status], [language, status]);
  });
}

test('independent language evaluation corpus', async () => {
  for (const item of languageCases) {
    const found = await detectLanguage(item.text);
    assert.equal(found.language, item.expected, `${item.kind}: ${item.text}`);
    assert.equal(found.confidence, null);
  }
});

test('long input is bounded and cached without changing its contents', async () => {
  const text = 'Xin chào, chúng tôi đọc một câu truyện. '.repeat(100_000);
  const before = text;
  const start = performance.now();
  const found = await detectLanguage(text);
  const elapsed = performance.now() - start;
  assert.equal(found.language, 'vi-VN');
  assert.equal(text, before);
  assert.ok(elapsed < 1000, `Detector took ${elapsed.toFixed(1)} ms`);
});
