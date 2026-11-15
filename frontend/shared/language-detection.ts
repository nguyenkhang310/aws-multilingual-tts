import { languageNames } from './languages';

export type LanguageDetection = {
  language: string | null;
  confidence: null;
  status: 'detected' | 'uncertain' | 'unknown' | 'mixed';
  candidates: { language: string }[];
  engine: 'eld-small-2.1.1';
};

export type LanguageModel = { detect(text: string): {
  language: string; isReliable(): boolean; getScores(): Record<string, number>;
} };

const cache = new Map<string, LanguageDetection>();
const defaults: Record<string, string> = {
  vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR',
  de: 'de-DE', es: 'es-ES', pt: 'pt-PT', it: 'it-IT', ru: 'ru-RU',
  hi: 'hi-IN', id: 'id-ID', ms: 'ms-MY', th: 'th-TH',
};
const traditional = /[這們國說書漢語龍門車東學愛時發後裡個來讀]/gu;
const locale = (code: string, text: string): string | null => code === 'zh'
  ? (text.match(traditional)?.length ?? 0) >= 2 ? 'zh-TW' : 'cmn-CN'
  : defaults[code] ?? Object.keys(languageNames).find(value => value.startsWith(`${code}-`)) ?? null;
const answer = (status: LanguageDetection['status'], language: string | null = null,
  candidates: string[] = []): LanguageDetection => ({ status, language, candidates: candidates.map(language => ({ language })),
    confidence: null, engine: 'eld-small-2.1.1' });

function mixedLanguages(text: string, model: LanguageModel): string[] {
  const clauses = text.split(/[.!?。！？\n]+/u).map(value => value.trim())
    .filter(value => value.length >= 12 || (value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0) >= 6);
  const tokens = text.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
  const halves = tokens.length >= 8
    ? [tokens.slice(0, Math.floor(tokens.length / 2)).join(' '), tokens.slice(Math.floor(tokens.length / 2)).join(' ')] : [];
  for (const parts of [clauses, halves]) {
    if (parts.length < 2) continue;
    const found = parts.map(part => model.detect(part)).filter(item => {
      const scores = Object.values(item.getScores()).sort((a, b) => b - a);
      return item.isReliable() && scores[0] >= 0.7 && scores[0] - (scores[1] ?? 0) >= 0.08;
    }).map(item => locale(item.language, text)).filter((code): code is string => !!code);
    if (new Set(found).size > 1) return [...new Set(found)];
  }
  return [];
}

/** Pure adapter for the trained ELD model; the web/app wrappers load the model once. */
export function identifyLanguage(input: string, model: LanguageModel): LanguageDetection {
  const sample = input.trim().slice(0, 1600);
  if (!sample) return answer('unknown');
  const cached = cache.get(sample);
  if (cached) return cached;
  const clean = sample.replace(/https?:\/\/\S+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, ' ')
    .replace(/[\p{N}\p{Extended_Pictographic}]/gu, ' ').trim();
  const letters = clean.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 4) return answer('uncertain');
  // Proper names spanning several capitalized words should not dominate a short sentence.
  const masked = clean.replace(/(?:\p{Lu}[\p{L}\p{M}]*\s+){1,3}\p{Lu}[\p{L}\p{M}]*/gu, ' ');
  const prepared = (masked.match(/\p{L}/gu)?.length ?? 0) >= 12 ? masked : clean;
  const mixed = mixedLanguages(prepared, model);
  const raw = model.detect(prepared);
  const ranked = Object.entries(raw.getScores()).sort((a, b) => b[1] - a[1]);
  const candidates = ranked.slice(0, 3).map(([code]) => locale(code, sample))
    .filter((code): code is string => !!code);
  const resolved = locale(raw.language, sample);
  const hanTie = raw.language === 'zh' && ranked.some(([code, score]) => code === 'ja' && ranked[0][1] - score < 0.08);
  const result = mixed.length ? answer('mixed', null, mixed)
    : resolved && raw.isReliable() && !hanTie && (letters >= 8 || ['zh', 'ja', 'ko'].includes(raw.language) && letters >= 6)
      ? answer('detected', resolved, candidates)
      : answer('uncertain', null, candidates);
  cache.set(sample, result);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return result;
}
