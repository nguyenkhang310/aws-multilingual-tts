import { performance } from 'node:perf_hooks';
import { languageCases } from '../../shared/language-evaluation';
import { detectLanguage } from '../src/lib/language-detection';

const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
const first = await detectLanguage(languageCases[0].text);
const initializedMs = performance.now() - started;
let correct = Number(first.language === languageCases[0].expected);
const outcomes = [{ kind: languageCases[0].kind, expected: languageCases[0].expected,
  language: first.language, status: first.status }];
for (const item of languageCases.slice(1)) {
  const found = await detectLanguage(item.text);
  correct += Number(found.language === item.expected);
  outcomes.push({ kind: item.kind, expected: item.expected, language: found.language, status: found.status });
}
const warmStarted = performance.now();
for (let round = 0; round < 100; round++) {
  for (const item of languageCases) await detectLanguage(`${item.text}${'.'.repeat(round + 1)}`);
}
const warmMs = (performance.now() - warmStarted) / (100 * languageCases.length);
console.log(JSON.stringify({ engine: first.engine, correct, total: languageCases.length,
  initializedMs: Number(initializedMs.toFixed(1)), warmMs: Number(warmMs.toFixed(3)),
  heapDeltaMiB: Number(((process.memoryUsage().heapUsed - heapBefore) / 1048576).toFixed(2)),
  outcomes }, null, 2));
