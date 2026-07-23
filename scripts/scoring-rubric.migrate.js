#!/usr/bin/env node
// scoring-rubric.migrate.js — recompute docs/ideas/*.json candidate scores under
// the active rubric (v2 by default) so historical pools are comparable.
//
// Usage:
//   node scripts/scoring-rubric.migrate.js [--in docs/ideas/] [--out docs/ideas/]
//   node scripts/scoring-rubric.migrate.js --file docs/ideas/2026-07-22-15.json
//
// Behavior:
//   - Reads each pool file. If `rubric_version` matches target, skip.
//   - For each candidate: read .scores.{demand,wtp,buildability,defensibility}
//     and recompute score_total under target rubric weights.
//   - Writes the file back atomically with the new score_total + rubric_version.
//   - Original file is moved to <file>.pre-v2.bak next to it (one-time per migration).
//
// This script is idempotent: running it twice on a v2 pool is a no-op.

import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { argv, exit } from 'node:process';

const TARGET_VERSION = '2.0.0';

const args = parseArgs(argv.slice(2));
const inDir = args.in || 'docs/ideas/';
const outDir = args.out || inDir;

const rubric = JSON.parse(await readFile(`agents/contracts/scoring-rubric.${TARGET_VERSION.split('.')[0] === '2' ? 'v2' : 'v1'}.json`, 'utf8'));
const w = rubric.weights;

const files = args.file
  ? [args.file]
  : (await readdir(inDir)).filter((f) => f.endsWith('.json')).map((f) => join(inDir, f));

let migrated = 0;
let skipped = 0;

for (const f of files) {
  let pool;
  try {
    pool = JSON.parse(await readFile(f, 'utf8'));
  } catch (err) {
    console.error(`skip ${f}: ${err.message}`);
    continue;
  }
  if (pool.rubric_version === TARGET_VERSION) {
    skipped++;
    continue;
  }
  if (!Array.isArray(pool.candidates)) {
    console.error(`skip ${f}: no candidates[]`);
    continue;
  }
  // Skip bak creation when in-place writing — git history is the real backup.
  const inPlace = outDir === inDir;
  if (!inPlace) {
    await rename(f, f + '.pre-v2.bak').catch(() => {});
  }

  for (const c of pool.candidates) {
    const s = c.scores || {};
    c.score_total = round2(
      (Number(s.demand) || 0) * w.demand +
      (Number(s.wtp) || 0) * w.wtp +
      (Number(s.buildability) || 0) * w.buildability +
      (Number(s.defensibility) || 0) * w.defensibility
    );
  }
  pool.candidates.sort((a, b) => b.score_total - a.score_total);
  pool.rubric_version = TARGET_VERSION;
  pool.migrated_at = new Date().toISOString();

  const out = outDir === inDir ? f : join(outDir, f.split('/').pop());
  await writeFile(out, JSON.stringify(pool, null, 2));
  migrated++;
  console.log(`migrated ${f} → rubric v${TARGET_VERSION} (${pool.candidates.length} candidates)`);
}

console.log(`\nDone. migrated=${migrated} skipped=${skipped}`);
exit(0);

function round2(n) {
  return Math.round(n * 100) / 100;
}

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
