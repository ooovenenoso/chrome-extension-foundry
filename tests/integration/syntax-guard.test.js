// tests/integration/syntax-guard.test.js — verifies the syntax-guard
// rejects malformed MV3 scaffolds, writes a rejection marker, and cleans up
// staged files without touching unrelated extensions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupWorkdir() {
  const work = mkdtempSync(join(tmpdir(), 'sg-int-'));
  const srcBad = join(work, 'src/bad-ext/lib');
  const srcGood = join(work, 'src/good-ext/lib');
  const testsUnit = join(work, 'tests/unit');
  const rejected = join(work, 'docs/specs/_rejected');
  mkdirSync(srcBad, { recursive: true });
  mkdirSync(srcGood, { recursive: true });
  mkdirSync(testsUnit, { recursive: true });
  mkdirSync(rejected, { recursive: true });

  // The exact SyntaxError pattern from run 29509685717 (2026-07-16).
  writeFileSync(join(srcBad, 'priorityScorer.js'), "const x = String(t) + '\n';\nexport default x;\n");
  writeFileSync(join(srcBad, 'helpers.js'), 'export const ok = 1;\n');
  writeFileSync(join(srcGood, 'foo.js'), 'export const ok = 1;\n');
  writeFileSync(join(work, 'syntax-guard.js'), readFileSync('scripts/syntax-guard.js', 'utf8'));
  return work;
}

test('syntax-guard: rejects scaffold with SyntaxError, writes marker, removes files', () => {
  const work = setupWorkdir();
  try {
    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', ['syntax-guard.js', '--extension-id', 'bad-ext', '--slot', 'TEST-INT-001', '--stage-dir', 'src/bad-ext'], { cwd: work, encoding: 'utf8' });
    } catch (e) {
      exitCode = e.status || 1;
      stderr = e.stderr?.toString() || '';
    }
    assert.equal(exitCode, 1, `expected exit 1, got ${exitCode}; stderr=${stderr}`);

    // Rejection marker must exist and contain the failing file path + stderr excerpt.
    const marker = join(work, 'docs/specs/_rejected/TEST-INT-001-bad-ext.md');
    assert.ok(existsSync(marker), 'rejection marker should exist');
    const body = readFileSync(marker, 'utf8');
    assert.match(body, /bad-ext/);
    assert.match(body, /priorityScorer\.js/);
    assert.match(body, /SyntaxError/);

    // Staged files for bad-ext must be removed.
    assert.equal(existsSync(join(work, 'src/bad-ext')), false, 'src/bad-ext should be removed');

    // Unrelated extension is untouched.
    assert.ok(existsSync(join(work, 'src/good-ext/lib/foo.js')), 'good-ext should be untouched');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('syntax-guard: passes valid scaffold, exits 0, writes nothing', () => {
  const work = setupWorkdir();
  try {
    // Use only the good-ext; the bad-ext will not be in target list.
    const out = execFileSync(
      'node', ['syntax-guard.js', '--extension-id', 'good-ext', '--slot', 'TEST-INT-002', '--stage-dir', 'src/good-ext'],
      { cwd: work, encoding: 'utf8' }
    );
    assert.match(out, /1 JS files passed/);

    assert.equal(existsSync(join(work, 'docs/specs/_rejected/TEST-INT-002-good-ext.md')), false);
    assert.ok(existsSync(join(work, 'src/good-ext/lib/foo.js')), 'good-ext should remain');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('syntax-guard: no files for extension-id → exit 0, no marker', () => {
  const work = setupWorkdir();
  try {
    const out = execFileSync('node', ['syntax-guard.js', '--extension-id', 'nonexistent'], { cwd: work, encoding: 'utf8' });
    assert.match(out, /no JS files found/);
    const rejectedDir = join(work, 'docs/specs/_rejected');
    const entries = existsSync(rejectedDir) ? readdirSync(rejectedDir) : [];
    assert.equal(entries.length, 0, `expected empty _rejected, got ${entries}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
