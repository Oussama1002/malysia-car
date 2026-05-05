import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const TARGETS = ['modules', 'routes', 'services', 'config'];
const ALLOWED_FILES = new Set([
  'services/erpApi.ts',
  'services/erpStore.ts',
  'services/mockApi.ts',
  'services/adapters/httpErpAdapter.ts',
]);

const forbiddenPatterns = [
  { pattern: /from ['"]@\/services\/mockApi['"]/g, reason: 'mockApi import in production path' },
  { pattern: /from ['"]@\/services\/erpApi['"]/g, reason: 'erpApi import in production path' },
  { pattern: /\bmockApi\b/g, reason: 'mockApi usage in production path' },
  { pattern: /\berpApi\./g, reason: 'erpApi usage in production path' },
  { pattern: /fall through to mock/gi, reason: 'silent mock fallback marker' },
];

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full));
      continue;
    }
    const ext = extname(full);
    if (ext === '.ts' || ext === '.tsx') out.push(full);
  }
  return out;
}

const failures = [];
for (const target of TARGETS) {
  const abs = join(ROOT, target);
  for (const file of listFiles(abs)) {
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    if (ALLOWED_FILES.has(rel)) continue;
    const content = readFileSync(file, 'utf8');
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(content)) {
        failures.push(`${rel}: ${rule.reason}`);
      }
      rule.pattern.lastIndex = 0;
    }
  }
}

if (failures.length > 0) {
  console.error('Production mock guard failed:\n' + failures.map((f) => `- ${f}`).join('\n'));
  process.exit(1);
}

console.log('Production mock guard passed.');
