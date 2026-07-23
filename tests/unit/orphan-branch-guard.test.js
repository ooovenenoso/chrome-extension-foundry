// tests/unit/orphan-branch-guard.test.js — verifies orphan-branch-guard
// filtering (prefix, age, no-PR), and dry-run formatting, using a fetch shim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve('.');
const SCRIPT = resolve(REPO_ROOT, 'scripts/orphan-branch-guard.js');

function runWithMock({ branches = [], commits = {}, args = [], env = {} }) {
  const work = mkdtempSync(join(tmpdir(), 'og-test-'));
  // Copy the real script into the work dir, then prepend a shim that:
  //   1. Sets REPO/GH_TOKEN env
  //   2. Reassigns process.argv so parseArgs() picks up our test args
  //   3. Replaces globalThis.fetch with a mock
  const localScript = join(work, 'guard.js');
  copyFileSync(SCRIPT, localScript);

  // Read source, inject env at top + replace fetch.
  let src = readFileSync(localScript, 'utf8');
  // Strip shebang so we can prepend JS statements.
  src = src.replace(/^#![^\n]*\n/, '');
  // Prepend env+argv shim.
  src = `process.env.REPO = 'foo/bar';\nprocess.env.GH_TOKEN = 'fake';\n` +
        `process.argv = ['node', 'guard.js', ...${JSON.stringify(args)}];\n` +
        `const realFetch = globalThis.fetch;\n` +
        `globalThis.fetch = async (url, opts) => {\n` +
        `  if (url.includes('/branches?')) return { ok: true, status: 200, json: async () => ${JSON.stringify(branches)}, text: async () => '' };\n` +
        `  if (url.includes('/commits/')) { const b = url.split('/commits/')[1]; const c = ${JSON.stringify(commits)}[b]; return c ? { ok: true, status: 200, json: async () => c, text: async () => '' } : { ok: false, status: 404, json: async () => ({}), text: async () => 'nf' }; }\n` +
        `  if (url.includes('/pulls?')) return { ok: true, status: 200, json: async () => [], text: async () => '' };\n` +
        `  return { ok: true, status: 204, json: async () => ({}), text: async () => '' };\n` +
        `};\n` +
        src;
  writeFileSync(localScript, src);

  const r = spawnSync('node', [localScript], { cwd: work, encoding: 'utf8', env: { ...process.env, ...env } });
  rmSync(work, { recursive: true, force: true });
  return r;
}

const isoHoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

test('orphan-branch-guard: dry-run lists old feat/mvp-* branches, skips fresh and unrelated', () => {
  const r = runWithMock({
    branches: [
      { name: 'feat/mvp-old-thing-scaffold' },
      { name: 'feat/mvp-fresh-thing-scaffold' },
      { name: 'feat/unrelated-branch' },
      { name: 'main' },
    ],
    commits: {
      'feat/mvp-old-thing-scaffold': { commit: { committer: { date: isoHoursAgo(48) } } },
      'feat/mvp-fresh-thing-scaffold': { commit: { committer: { date: isoHoursAgo(1) } } },
      'feat/unrelated-branch': { commit: { committer: { date: isoHoursAgo(48) } } },
    },
    args: ['--dry-run', '--max-age-hours', '24', '--prefix', 'feat/mvp-'],
  });
  assert.equal(r.status, 0, `stderr=${r.stderr}`);
  assert.match(r.stdout, /DRY RUN/);
  assert.match(r.stdout, /feat\/mvp-old-thing-scaffold/);
  assert.equal(r.stdout.includes('feat/mvp-fresh-thing-scaffold'), false, 'fresh branch must NOT be listed');
  assert.equal(r.stdout.includes('feat/unrelated-branch'), false, 'unrelated prefix must NOT be listed');
});

test('orphan-branch-guard: zero branches → exit 0', () => {
  const r = runWithMock({ branches: [], commits: {}, args: ['--dry-run'] });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /0 branches/);
});

test('orphan-branch-guard: missing env → exit 2', () => {
  // Run without setting REPO/GH_TOKEN env. The script's env check fires before fetch.
  const r = spawnSync('node', [SCRIPT, '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, REPO: '', GH_TOKEN: '' },
  });
  assert.equal(r.status, 2);
});
