#!/usr/bin/env node
// pr-drafter.js — generates a real first-pass MV3 extension from a completed spec.
// The workflow commits + opens the PR via peter-evans/create-pull-request.
//
// Usage:
//   node agents/scripts/pr-drafter.js --spec docs/specs/<id>/GOAL.md

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { argv, exit } from 'node:process';
import { basename } from 'node:path';
import { deflateSync } from 'node:zlib';

const args = parseArgs(argv.slice(2));
if (!args.spec) { console.error('required: --spec <GOAL.md>'); exit(2); }

const specPath = args.spec;
const spec = await readFile(specPath, 'utf8');
const extId = basename(specPath.replace(/\/GOAL\.md$/, ''));
const extName = titleFromSpec(spec, extId);

const sectionCheck = checkSections(spec);
if (sectionCheck) { console.error(`spec contract fail: ${sectionCheck}`); exit(2); }

const wordCount = spec.split(/\s+/).filter(Boolean).length;
if (wordCount > 2500) { console.error(`spec body exceeds 2500 words (${wordCount})`); exit(2); }

const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
if (status.stdout.trim()) {
  console.error('working tree is dirty, abort (commit or stash first)');
  exit(1);
}

const srcDir = `src/${extId}`;
await mkdir(`${srcDir}/lib`, { recursive: true });
await mkdir(`${srcDir}/assets/icons`, { recursive: true });
await mkdir('tests/unit', { recursive: true });
await mkdir('tests/integration', { recursive: true });

await writeFile(`${srcDir}/manifest.json`, manifest(extId, extName));
await writeFile(`${srcDir}/popup.html`, popupHtml(extName));
await writeFile(`${srcDir}/popup.css`, popupCss());
await writeFile(`${srcDir}/popup.js`, popupJs());
await writeFile(`${srcDir}/contentScript.js`, contentScript());
await writeFile(`${srcDir}/service-worker.js`, serviceWorker());
await writeFile(`${srcDir}/lib/priorityScorer.js`, priorityScorer());
await writeFile(`${srcDir}/PRIVACY.md`, privacy(extName));
await writeFile(`${srcDir}/STRIPE_LINKS.md`, stripeLinks(extName));
await writeFile(`tests/unit/${extId}-priority.test.js`, unitTest(extId));
await writeFile(`tests/integration/${extId}-manifest.test.js`, manifestTest(extId, extName));

for (const size of [16, 32, 48, 128]) {
  await writeFile(`${srcDir}/assets/icons/icon${size}.png`, pngIcon(size));
}

spawnSync('git', ['add', `${srcDir}/`, `tests/unit/${extId}-priority.test.js`, `tests/integration/${extId}-manifest.test.js`], { stdio: 'inherit' });

console.log(`pr-draft · ${extId} · real MV3 scaffold staged (${extName})`);
exit(0);

function titleFromSpec(markdown, fallback) {
  const heading = markdown.match(/^#\s+GOAL\.md\s+—\s+(.+)$/m)?.[1]?.trim();
  if (heading && !heading.includes('<')) return heading;
  return fallback.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

function manifest(id, name) {
  return JSON.stringify({
    manifest_version: 3,
    name,
    version: '0.1.0',
    description: `Scores the current page context locally for ${name} priority signals.`,
    action: { default_title: name, default_popup: 'popup.html' },
    permissions: ['storage', 'activeTab'],
    host_permissions: ['http://*/*', 'https://*/*'],
    background: { service_worker: 'service-worker.js' },
    content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['contentScript.js'], run_at: 'document_idle' }],
    icons: { 16: 'assets/icons/icon16.png', 32: 'assets/icons/icon32.png', 48: 'assets/icons/icon48.png', 128: 'assets/icons/icon128.png' },
  }, null, 2) + '\n';
}

function popupHtml(name) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(name)}</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <main class="shell">
      <header><div class="mark">★</div><div><h1>${escapeHtml(name)}</h1><p>Local page priority scoring.</p></div></header>
      <section id="result" class="card muted">Open a relevant page, then score the current tab. No page text leaves your browser.</section>
      <div class="actions">
        <button id="scoreCurrentPage" type="button">Score current page</button>
        <button id="runDemo" class="secondary" type="button">Run demo sample</button>
      </div>
      <footer><span>Tip jar:</span><a id="tip3" target="_blank" rel="noopener">$3</a><a id="tip5" target="_blank" rel="noopener">$5</a><a id="tip10" target="_blank" rel="noopener">$10</a></footer>
    </main>
    <script type="module" src="popup.js"></script>
  </body>
</html>
`;
}

function popupCss() {
  return `* { box-sizing: border-box; }
body { margin: 0; width: 360px; min-height: 420px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #e5eefb; background: #0f172a; }
.shell { padding: 16px; }
header { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.mark { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(135deg, #38bdf8, #2563eb); color: white; font-weight: 900; }
h1 { font-size: 18px; margin: 0; }
p { margin: 2px 0 0; color: #94a3b8; font-size: 12px; }
.card { border: 1px solid #1e3a5f; border-radius: 14px; padding: 14px; background: #111c33; margin-bottom: 12px; line-height: 1.45; }
.card.high { border-color: #fb7185; background: #2b1420; }
.card.medium { border-color: #fbbf24; background: #2a2110; }
.card.low { border-color: #22c55e; background: #102719; }
.muted { color: #b6c2d2; }
.score { font-size: 34px; font-weight: 800; }
ul { margin: 8px 0 0; padding-left: 18px; }
.actions { display: grid; gap: 8px; }
button { border: 0; border-radius: 12px; padding: 11px 12px; background: #38bdf8; color: #07111f; font-weight: 800; cursor: pointer; }
button.secondary { background: #1e293b; color: #dbeafe; border: 1px solid #334155; }
footer { margin-top: 16px; display: flex; gap: 10px; align-items: center; color: #94a3b8; font-size: 12px; }
a { color: #7dd3fc; }
`;
}

function popupJs() {
  return `import { scorePageContext, summarizePriority } from './lib/priorityScorer.js';

const TIP_LINKS = {
  tip3: 'https://buy.stripe.com/test_replace_tip3',
  tip5: 'https://buy.stripe.com/test_replace_tip5',
  tip10: 'https://buy.stripe.com/test_replace_tip10',
};

const DEMO_CONTEXT = {
  title: 'Urgent customer contract approval needed today',
  url: 'https://example.com/opportunity',
  text: 'The customer is blocked on pricing, legal terms, procurement, and renewal approval before EOD today.',
};

function setTipLinks() {
  for (const [id, href] of Object.entries(TIP_LINKS)) {
    const el = document.getElementById(id);
    if (el) el.href = href;
  }
}

function renderResult(result) {
  const target = document.getElementById('result');
  target.className = \`card \${result.level}\`;
  target.innerHTML = \`<div class="score">\${result.score}</div><strong>\${summarizePriority(result)}</strong><ul>\${result.reasons.map((reason) => \`<li>\${reason}</li>\`).join('')}</ul>\`;
}

function renderError(message) {
  const target = document.getElementById('result');
  target.className = 'card muted';
  target.textContent = message;
}

async function scoreCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      renderError('No active tab found.');
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_PAGE_CONTEXT' });
    if (!response?.ok) throw new Error('No page context returned');
    const result = scorePageContext(response.context);
    await chrome.storage.local.set({ lastPriorityScore: { ...result, at: new Date().toISOString(), url: tab.url } });
    renderResult(result);
  } catch (error) {
    renderError(\`Could not read this tab yet. Reload the page and try again. (\${error.message})\`);
  }
}

function runDemo() { renderResult(scorePageContext(DEMO_CONTEXT)); }

setTipLinks();
document.getElementById('scoreCurrentPage').addEventListener('click', scoreCurrentPage);
document.getElementById('runDemo').addEventListener('click', runDemo);
`;
}

function contentScript() {
  return `function capturePageContext() {
  const text = (document.body?.innerText || document.documentElement?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 8000);
  return { title: document.title || '', url: location.href, text, capturedAt: new Date().toISOString() };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CAPTURE_PAGE_CONTEXT') {
    sendResponse({ ok: true, context: capturePageContext() });
    return true;
  }
  return false;
});
`;
}

function serviceWorker() {
  return `chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ installedAt: new Date().toISOString() });
});
`;
}

function priorityScorer() {
  return `const URGENCY_TERMS = ['urgent', 'asap', 'today', 'eod', 'blocked', 'deadline', 'approval', 'immediately', 'critical'];
const VALUE_TERMS = ['contract', 'proposal', 'pricing', 'renewal', 'invoice', 'purchase order', 'deal', 'customer', 'client', 'budget', 'legal', 'procurement'];
const LOW_PRIORITY_TERMS = ['newsletter', 'unsubscribe', 'webinar', 'digest', 'promotion', 'noreply', 'marketing', 'blog posts'];

function countMatches(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

export function scorePageContext({ title = '', url = '', text = '' } = {}) {
  const combined = String(title) + '\n' + String(url) + '\n' + String(text);
  const urgency = countMatches(combined, URGENCY_TERMS);
  const value = countMatches(combined, VALUE_TERMS);
  const lowPriority = countMatches(combined, LOW_PRIORITY_TERMS);
  let score = 25 + Math.min(urgency * 14, 35) + Math.min(value * 10, 30) - Math.min(lowPriority * 16, 45);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
  const reasons = [];
  if (urgency) reasons.push(String(urgency) + ' urgency signal' + (urgency === 1 ? '' : 's') + ' found');
  if (value) reasons.push(String(value) + ' value/deal signal' + (value === 1 ? '' : 's') + ' found');
  if (lowPriority) reasons.push('newsletter/marketing signal lowered priority');
  if (!reasons.length) reasons.push('no strong priority signals found');
  return { score, level, reasons, signals: { urgency, value, lowPriority } };
}

export function summarizePriority(result) {
  const label = result.level === 'high' ? 'High priority' : result.level === 'medium' ? 'Medium priority' : 'Low priority';
  return label + ' (' + result.score + '/100): ' + result.reasons.slice(0, 2).join('; ');
}
`;
}

function privacy(name) {
  return `# Privacy — ${name}

${name} runs locally in Chrome.

- It reads visible page text only after the user clicks the popup action.
- It does not send page content to any external server.
- It stores only the latest score summary in \`chrome.storage.local\`.
- The first MVP uses deterministic local scoring, not an LLM API.
- Stripe links are placeholders until live payment links are configured.
`;
}

function stripeLinks(name) {
  return `# Stripe Links — ${name}

Placeholder links for the first PR. Replace before Chrome Web Store submission.

| Tier | URL | Link ID |
|---|---|---|
| $3 Coffee | \`https://buy.stripe.com/test_replace_tip3\` | \`test_replace_tip3\` |
| $5 Lunch | \`https://buy.stripe.com/test_replace_tip5\` | \`test_replace_tip5\` |
| $10 Generous | \`https://buy.stripe.com/test_replace_tip10\` | \`test_replace_tip10\` |
`;
}

function unitTest(id) {
  return `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePageContext, summarizePriority } from '../../src/${id}/lib/priorityScorer.js';

test('${id}: urgent deal context scores high', () => {
  const result = scorePageContext({ title: 'Urgent approval today', url: 'https://example.com', text: 'Customer contract pricing and legal procurement are blocked before EOD.' });
  assert.equal(result.level, 'high');
  assert.ok(result.score >= 75);
  assert.ok(result.reasons.some((reason) => reason.includes('urgency')));
});

test('${id}: newsletter context scores low', () => {
  const result = scorePageContext({ title: 'Weekly newsletter', text: 'Digest of blog posts. Unsubscribe any time.' });
  assert.equal(result.level, 'low');
  assert.ok(result.score < 45);
});

test('${id}: summary is human-readable', () => {
  const summary = summarizePriority({ score: 82, level: 'high', reasons: ['urgency signal found'] });
  assert.match(summary, /High priority/);
  assert.match(summary, /82/);
});
`;
}

function manifestTest(id, name) {
  return `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const EXT_DIR = 'src/${id}';

test('${id}: manifest is loadable MV3 with real matches and icons', () => {
  const m = JSON.parse(readFileSync(\`${'${EXT_DIR}'}/manifest.json\`, 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, ${JSON.stringify(name)});
  assert.equal(m.version, '0.1.0');
  assert.notEqual(m.content_scripts[0].matches[0], '<TODO>');
  assert.ok(m.action.default_popup);
  for (const icon of Object.values(m.icons)) assert.ok(existsSync(\`${'${EXT_DIR}'}/\${icon}\`), icon);
});

test('${id}: popup/content/stripe files are wired', () => {
  const popup = readFileSync(\`${'${EXT_DIR}'}/popup.js\`, 'utf8');
  const content = readFileSync(\`${'${EXT_DIR}'}/contentScript.js\`, 'utf8');
  const stripe = readFileSync(\`${'${EXT_DIR}'}/STRIPE_LINKS.md\`, 'utf8');
  assert.match(popup, /scoreCurrentPage/);
  assert.match(popup, /runDemo/);
  assert.match(content, /CAPTURE_PAGE_CONTEXT/);
  assert.match(stripe, /test_replace_tip3/);
});
`;
}

function pngIcon(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const border = x < Math.max(1, size / 12) || y < Math.max(1, size / 12) || x >= size - Math.max(1, size / 12) || y >= size - Math.max(1, size / 12);
      const diag = Math.abs(x - y) < Math.max(1, size / 10);
      const rgba = border ? [56, 189, 248, 255] : diag ? [251, 113, 133, 255] : [15, 23, 42, 255];
      row.push(...rgba);
    }
    rows.push(Buffer.from(row));
  }
  const raw = Buffer.concat(rows);
  const chunks = [
    chunk('IHDR', Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), ...chunks]);
}

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(Math.round(n), 0); return b; }
function chunk(type, data) {
  const t = Buffer.from(type);
  const crcInput = Buffer.concat([t, data]);
  return Buffer.concat([u32(data.length), t, data, u32(crc32(crcInput))]);
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function checkSections(spec) {
  const required = ['§1', '§2', '§3', '§4', '§5', '§6', '§7', '§8', '§9', '§10'];
  for (const s of required) {
    const re = new RegExp(`^##\\s+${s}(?:[.\\s]|$)`, 'm');
    if (!re.test(spec)) return `missing section ${s}`;
  }
  return null;
}

function parseArgs(arr) {
  const out = {};
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = arr[i + 1]?.startsWith('--') ? true : arr[++i];
      out[k] = v;
    }
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
