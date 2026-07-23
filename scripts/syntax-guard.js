#!/usr/bin/env node
// syntax-guard.js — validates every JS file staged by pr-drafter before it lands
// in a commit. If anything fails node --check, the staged files are wiped and
// a docs/specs/_rejected/<slot>-<id>.md marker is written instead.
//
// Usage:
//   node scripts/syntax-guard.js --extension-id <id> [--slot <slot>] [--stage-dir <path>]
//
// Exit codes:
//   0  all staged JS files passed node --check (or no JS files to check)
//   1  one or more JS files failed; rejection marker written; staged files removed
//   2  usage error

import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { argv, exit } from 'node:process';

const args = parseArgs(argv.slice(2));
if (!args['extension-id']) {
  console.error('required: --extension-id <id>');
  exit(2);
}
const extId = args['extension-id'];
const slot = args.slot || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const stageDir = args['stage-dir'] || `src/${extId}`;

let failed = 0;
const checked = [];
const offenders = [];

// 1. Find every .js file in the stage dir (and tests/).
const targets = new Set();
async function walk(p) {
  let s;
  try { s = await stat(p); } catch { return; }
  if (s.isDirectory()) {
    for (const entry of await readdir(p)) await walk(join(p, entry));
  } else if (s.isFile() && p.endsWith('.js')) {
    targets.add(p);
  }
}
await walk(stageDir);
for (const t of ['tests/unit', 'tests/integration']) {
  try { await walk(t); } catch {}
}

// Restrict to files for this extension id only (avoid scanning other extensions).
const onlyThisExt = [...targets].filter((p) => p.includes(`/${extId}/`) || p.includes(`/${extId}-`));
if (onlyThisExt.length === 0) {
  console.log(`syntax-guard: no JS files found for ${extId} — nothing to check`);
  exit(0);
}

// 2. Run node --check on each file. Capture output if it fails.
for (const f of onlyThisExt) {
  const rel = relative(process.cwd(), f);
  const r = spawnSync('node', ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    offenders.push({ file: rel, stderr: (r.stderr || '').slice(0, 800) });
  } else {
    checked.push(rel);
  }
}

if (failed === 0) {
  console.log(`syntax-guard: ${extId} · ${checked.length} JS files passed node --check`);
  exit(0);
}

// 3. Reject: remove staged files (only this extension), write rejection marker.
console.error(`syntax-guard: ${extId} · ${failed} JS file(s) failed node --check — rejecting scaffold`);

const rejectionDir = 'docs/specs/_rejected';
await mkdir(rejectionDir, { recursive: true });
const marker = join(rejectionDir, `${slot}-${extId}.md`);
const markerBody = [
  `# Rejected scaffold — ${extId}`,
  ``,
  `Slot: ${slot}`,
  `Rejected at: ${new Date().toISOString()}`,
  ``,
  `## Syntax errors`,
  ``,
  ...offenders.flatMap((o) => [`### ${o.file}`, '```', o.stderr.trim(), '```', '']),
  ``,
  `## Files that were removed`,
  ``,
  `- src/${extId}/`,
  `- tests/unit/${extId}-*.test.js`,
  `- tests/integration/${extId}-*.test.js`,
  ``,
  `## Recovery`,
  ``,
  `pr-drafter must be re-run with the spec at docs/specs/${extId}/GOAL.md after the prompt`,
  `template is fixed. See scripts/syntax-guard.js and the spec-writer log for context.`,
].join('\n');
await writeFile(marker, markerBody);

// Remove only this extension's staged files.
for (const root of [`src/${extId}`, `tests/unit/${extId}-priority.test.js`, `tests/integration/${extId}-manifest.test.js`]) {
  await rm(root, { recursive: true, force: true });
}

console.error(`syntax-guard: rejection marker written to ${marker}`);
exit(1);

function parseArgs(arr) {
  const out = {};
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = arr[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else { out[k] = next; i++; }
    }
  }
  return out;
}
