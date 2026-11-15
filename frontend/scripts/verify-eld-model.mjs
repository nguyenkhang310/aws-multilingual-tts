import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const expected = {
  version: '2.1.1',
  bytes: 1_600_055,
  sha256: '81df62f6b072f475b5b09e2cfa4a8ba4ab71eb99c713eb4b4ace461463180ab6',
  tarball: 'https://registry.npmjs.org/eld/-/eld-2.1.1.tgz',
  integrity: 'sha512-+WPgDcsV5rAuZR3BTW3rnnv03YvlP2JoHnFGDMLAp13XrDt7n58TBIL9hTmFs4VBVcozGxG/GC5WQILqRqd1pw==',
};

const target = process.argv[2];
if (!['web', 'app'].includes(target)) {
  throw new Error('Dùng: node ../scripts/verify-eld-model.mjs web|app');
}

const packageRoot = resolve(fileURLToPath(new URL(`../${target}/`, import.meta.url)));
const lock = JSON.parse(await readFile(resolve(packageRoot, 'package-lock.json'), 'utf8'));
const lockedEld = lock.packages?.['node_modules/eld'];
if (lockedEld?.version !== expected.version || lockedEld.resolved !== expected.tarball || lockedEld.integrity !== expected.integrity) {
  throw new Error(`package-lock của frontend/${target} không khớp ELD ${expected.version} đã duyệt.`);
}

const modelPath = resolve(packageRoot, 'node_modules/eld/src/ngrams/small.js');
const [metadata, bytes] = await Promise.all([stat(modelPath), readFile(modelPath)]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (metadata.size !== expected.bytes || sha256 !== expected.sha256) {
  throw new Error(`Model ELD không hợp lệ tại ${modelPath}: nhận ${metadata.size} byte, SHA-256 ${sha256}. Chạy npm ci để cài lại từ lockfile.`);
}

console.log(`PASS ELD ${expected.version}: ${metadata.size} byte, SHA-256 ${sha256} (${target})`);
