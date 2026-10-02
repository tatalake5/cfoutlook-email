// i18n coverage checker.
// Hard failures (exit 1):
//   1. A t('...') key or data-i18n* attribute used in the frontend that has no
//      entry in I18N_EN (would silently render Chinese in EN mode).
//   2. Raw Chinese text in app.js outside t()/tServer() calls and comments.
// Warnings (exit 0):
//   - Unused I18N_EN entries.
//   - Backend Chinese messages (static literals in src/routes etc.) not covered
//     by SERVER_EN / SERVER_EN_PATTERNS.
// Usage: node tools/i18n-check.mjs

import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const CN = /[一-鿿]/;

// ---- Load dictionaries from i18n.js with browser globals stubbed ----
const sandbox = {
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { addEventListener: () => {}, documentElement: {}, querySelectorAll: () => [] },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('public/assets/i18n.js'), sandbox);
const I18N_EN = sandbox.I18N_EN;
const SERVER_EN = sandbox.SERVER_EN;
const SERVER_EN_PATTERNS = sandbox.SERVER_EN_PATTERNS;
if (!I18N_EN || !SERVER_EN || !SERVER_EN_PATTERNS) {
  console.error('FAIL: could not load I18N_EN / SERVER_EN from public/assets/i18n.js');
  process.exit(1);
}

// ---- Collect used keys ----
const usedKeys = new Set();

// t('...') / t("...") calls (single-line string literals, no escapes used in this codebase)
function collectTCalls(src) {
  for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) usedKeys.add(m[1]);
}
// data-i18n / data-i18n-title / data-i18n-placeholder attributes
function collectDataAttrs(src) {
  for (const m of src.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)) usedKeys.add(m[1]);
}

const appJs = read('public/assets/app.js');
const indexHtml = read('public/index.html');
const loginHtml = read('public/login.html');
collectTCalls(appJs);
collectTCalls(loginHtml);
collectDataAttrs(indexHtml);
collectDataAttrs(loginHtml);

// ---- Check 1: every used key that contains Chinese must have an EN entry ----
const missing = [...usedKeys].filter((k) => CN.test(k) && !Object.prototype.hasOwnProperty.call(I18N_EN, k));

// ---- Check 2: raw Chinese in app.js outside t()/tServer()/comments ----
// Known allowed fragments (URLs whose anchors are Chinese headings in GUIDE.md)
const ALLOW = [/GUIDE\.md#/];
const rawLeaks = [];
appJs.split('\n').forEach((line, i) => {
  if (!CN.test(line)) return;
  let s = line
    .replace(/\bt\(\s*'(?:[^'\\]|\\.)*'/g, 'T(')
    .replace(/\btServer\(\s*'(?:[^'\\]|\\.)*'/g, 'TS(')
    .replace(/\btServer\([^)]*\|\|\s*'(?:[^'\\]|\\.)*'\)/g, 'TS()')
    .replace(/\/\/.*$/, '');
  if (ALLOW.some((re) => re.test(line))) return;
  if (CN.test(s)) rawLeaks.push(`${i + 1}: ${line.trim()}`);
});

// ---- Check 3 (warn): unused dictionary entries ----
const unused = Object.keys(I18N_EN).filter((k) => !usedKeys.has(k));

// ---- Check 4 (warn): backend static Chinese messages not covered ----
const serverMisses = [];
const routeFiles = fs
  .readdirSync('src', { recursive: true })
  .filter((f) => String(f).endsWith('.ts'))
  .map((f) => `src/${f}`);
for (const f of routeFiles) {
  const src = read(f);
  for (const m of src.matchAll(/\b(?:ok|fail|badRequest|notFound|serverError|unauthorized)\([^)]*?'([^'${}]*[一-鿿][^'${}]*)'/g)) {
    const msg = m[1];
    const covered =
      Object.prototype.hasOwnProperty.call(SERVER_EN, msg) ||
      SERVER_EN_PATTERNS.some(([re]) => re.test(msg));
    if (!covered) serverMisses.push(`${f}: '${msg}'`);
  }
}

// ---- Report ----
console.log(`used keys: ${usedKeys.size}, dict entries: ${Object.keys(I18N_EN).length}, server map: ${Object.keys(SERVER_EN).length} + ${SERVER_EN_PATTERNS.length} patterns`);
if (unused.length) {
  console.log(`\nWARN unused I18N_EN entries (${unused.length}):`);
  unused.forEach((k) => console.log('  - ' + k));
}
if (serverMisses.length) {
  console.log(`\nWARN backend messages without SERVER_EN coverage (${serverMisses.length}):`);
  [...new Set(serverMisses)].forEach((k) => console.log('  - ' + k));
}
let failed = false;
if (missing.length) {
  failed = true;
  console.error(`\nFAIL keys used but missing from I18N_EN (${missing.length}):`);
  missing.forEach((k) => console.error('  - ' + k));
}
if (rawLeaks.length) {
  failed = true;
  console.error(`\nFAIL raw Chinese in app.js outside t()/tServer()/comments (${rawLeaks.length}):`);
  rawLeaks.forEach((k) => console.error('  - ' + k));
}
if (failed) process.exit(1);
console.log('\ni18n check PASSED');
