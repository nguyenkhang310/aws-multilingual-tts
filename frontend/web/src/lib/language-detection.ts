import { identifyLanguage, type LanguageDetection } from '../../../shared/language-detection';

export type { LanguageDetection };
let model: Promise<typeof import('eld/small')['eld']> | undefined;

export async function detectLanguage(text: string): Promise<LanguageDetection> {
  if (!text.trim()) return { language: null, status: 'unknown', confidence: null,
    candidates: [], engine: 'eld-small-2.1.1' };
  model ??= import('eld/small').then(module => module.eld).catch(error => { model = undefined; throw error; });
  return identifyLanguage(text, await model);
}
