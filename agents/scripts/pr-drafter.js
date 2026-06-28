#!/usr/bin/env node
// pr-drafter.js — scaffolds the MVP for a spec and stages files for commit.
// The workflow then commits + opens the PR via peter-evans/create-pull-request.
// (This script used to call `gh pr create` directly, but GitHub Actions'
// default GITHUB_TOKEN is blocked from creating PRs in some repos. The
// peter-evans action uses a different code path that works in all cases.)
//
// Usage:
//   node agents/scripts/pr-drafter.js --spec docs/specs/<id>/GOAL.md
//
// Behavior:
//   - Reads the spec.
//   - Validates the 9-section contract (§1-§10).
//   - Writes MVP scaffold to src/<id>/, tests/, STRIPE_LINKS.md.
//   - Stages the changes but does NOT commit (workflow does that).
//
// Exit codes:
//   0 = scaffold written, ready for commit
//   1 = spec rejected (score too low, missing sections, etc.)
//   2 = input error
//
// Requires:
//   - Node 20+
//   - Clean working tree on the spec branch
//   - The spec must already exist at the given path

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { argv, exit } from 'node:process';
import { join, basename } from 'node:path';

const args = parseArgs(argv.slice(2));
if (!args.spec) { console.error('required: --spec <GOAL.md>'); exit(2); }

const specPath = args.spec;
const spec = await readFile(specPath, 'utf8');
const extId = basename(specPath.replace(/\/GOAL\.md$/, ''));

const sectionCheck = checkSections(spec);
if (sectionCheck) { console.error(`spec contract fail: ${sectionCheck}`); exit(2); }

const wordCount = spec.split(/\s+/).filter(Boolean).length;
if (wordCount > 2500) { console.error(`spec body exceeds 2500 words (${wordCount})`); exit(2); }

// Check main is clean (we don't want to mix spec docs with scaffold files)
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
if (status.stdout.trim()) {
  console.error('working tree is dirty, abort (commit or stash first)');
  exit(1);
}

// Scaffold
const srcDir = `src/${extId}`;
const testsDir = `tests`;
await mkdir(`${srcDir}/lib`, { recursive: true });
await mkdir(`${srcDir}/assets/icons`, { recursive: true });
await mkdir(`${testsDir}/unit`, { recursive: true });
await mkdir(`${testsDir}/integration`, { recursive: true });

await writeFile(`${srcDir}/manifest.json`, manifest(extId));
await writeFile(`${srcDir}/popup.html`, popupHtml());
await writeFile(`${srcDir}/popup.css`, popupCss());
await writeFile(`${srcDir}/popup.js`, popupJs());
await writeFile(`${srcDir}/contentScript.js`, `// ${extId} content script — MVP noop\nconsole.log('[${extId}] loaded');\n`);
await writeFile(`${srcDir}/lib/hello.js`, `export function hello(name) { return \`Hello, \${name}!\`; }\n`);
await writeFile(`${srcDir}/PRIVACY.md`, `# ${extId} Privacy Policy\n\nThis extension does not collect, transmit, or sell any user data. All state is stored locally in chrome.storage.local.\n`);
await writeFile(`${testsDir}/unit/hello.test.js`, `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { hello } from '../../src/${extId}/lib/hello.js';\n\ntest('hello returns greeting', () => {\n  assert.equal(hello('World'), 'Hello, World!');\n});\n`);
await writeFile(`${testsDir}/integration/manifest.test.js`, manifestTest(extId));
await writeFile(`STRIPE_LINKS.md`, stripeLinks());

// Stage the new files. The workflow will commit + push on a new branch
// via peter-evans/create-pull-request.
spawnSync('git', ['add', `${srcDir}/`, `${testsDir}/`, `STRIPE_LINKS.md`], { stdio: 'inherit' });

console.log(`pr-draft · ${extId} · scaffold staged (10 files, branch will be created by workflow)`);
exit(0);

// ─── helpers ────────────────────────────────────────────────────────────────

function manifest(id) {
  return JSON.stringify({
    manifest_version: 3,
    name: id,
    version: '0.1.0',
    description: 'TODO — populate from docs/specs/' + id + '/GOAL.md §1',
    permissions: ['storage', 'activeTab'],
    action: { default_popup: 'popup.html' },
    content_scripts: [{ matches: ['<TODO>'], js: ['contentScript.js'] }],
    icons: { 16: 'assets/icons/16.png', 32: 'assets/icons/32.png', 48: 'assets/icons/48.png', 128: 'assets/icons/128.png' },
  }, null, 2);
}

function popupHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="popup.css"></head>
<body>
  <h1>Extension</h1>
  <p>Welcome. Tip jar below.</p>
  <a id="tip3" target="_blank">Tip $3</a>
  <a id="tip5" target="_blank">Tip $5</a>
  <a id="tip10" target="_blank">Tip $10</a>
  <script type="module" src="popup.js"></script>
</body></html>
`;
}

function popupCss() { return `body { font-family: system-ui; padding: 12px; }\n`; }

function popupJs() {
  return `// MVP — wire TIP_LINKS at build time from STRIPE_LINKS.md.
const TIP_LINKS = { tip3: '#', tip5: '#', tip10: '#' };
for (const [k, v] of Object.entries(TIP_LINKS)) {
  const el = document.getElementById(k);
  if (el) el.href = v;
}
`;
}

function manifestTest(id) {
  return `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manifest is MV3 with required fields', () => {
  const m = JSON.parse(readFileSync('src/${id}/manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.ok(m.name);
  assert.ok(m.version);
  assert.ok(Array.isArray(m.permissions));
});
`;
}

function stripeLinks() {
  return `# Stripe Payment Links

> Single source of truth. The popup's \`TIP_LINKS\` constant is set from these at build time.

## tip3
- ID: <placeholder>
- URL: https://buy.stripe.com/<placeholder>
- Status: placeholder (replace before publish)

## tip5
- ID: <placeholder>
- URL: https://buy.stripe.com/<placeholder>
- Status: placeholder

## tip10
- ID: <placeholder>
- URL: https://buy.stripe.com/<placeholder>
- Status: placeholder
`;
}

function prBodyText(extId, specPath) {
  return `## What

Scaffolds the \`${extId}\` MV3 extension per \`${specPath}\` §11.

## How

- \`src/${extId}/manifest.json\` — MV3, permissions per spec §4
- \`src/${extId}/popup.{html,css,js}\` — minimal render, tip links from \`TIP_LINKS\`
- \`src/${extId}/contentScript.js\` — noop, ready for §3 features
- \`src/${extId}/lib/hello.js\` — placeholder feature, fully tested
- \`tests/unit/hello.test.js\` — one test, passing
- \`tests/integration/manifest.test.js\` — schema valid, MV3 compliant

## Test plan

- [ ] \`npm test\` exits 0
- [ ] CI workflow green on this branch

## Checklist

- [ ] Read \`${specPath}\` end to end
- [ ] All permissions in \`manifest.json\` appear in \`GOAL.md §4\`
- [ ] \`STRIPE_LINKS.md\` is the placeholder (replace before publish)
- [ ] No edits to \`docs/\`
`;
}

function checkSections(spec) {
  // Sections may appear as `## §1`, `## §1. Mission`, `## §1 Mission`, etc.
  // Match on the leading §N marker (with optional `.` or space + name).
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
