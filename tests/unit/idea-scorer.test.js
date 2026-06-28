// tests/unit/idea-scorer.test.js — verifies deterministic scoring against fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXTURE = 'tests/fixtures/contracts/research-snapshot.fixture.json';
const FIXTURE_SLOT = '2026-06-28-13';

test('idea-scorer: produces valid idea-pool from fixture', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'scorer-'));
  try {
    execFileSync('node', ['agents/scripts/idea-scorer.js', '--in', FIXTURE, '--out', outDir], { encoding: 'utf8' });

    const outFile = join(outDir, `${FIXTURE_SLOT}.json`);
    assert.ok(existsSync(outFile), 'output file exists');

    const out = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(out.slot, FIXTURE_SLOT);
    assert.equal(out.week, '2026-W26');
    assert.equal(out.rubric_version, '1.0.0');
    assert.ok(Array.isArray(out.candidates));
    assert.ok(out.candidates.length >= 1, 'at least one candidate');

    for (const c of out.candidates) {
      assert.ok(c.id);
      assert.ok(c.name);
      assert.ok(c.pitch);
      assert.ok(c.pain);
      assert.ok(c.scores);
      assert.ok(typeof c.score_total === 'number');
      assert.ok(c.score_total >= 0 && c.score_total <= 10);
      assert.ok(c.monetization_hint?.model);
      // ai_generated is now the only valid source.
      assert.equal(c.source_refs[0].source, 'ai_generated');
    }

    const top = out.candidates[0];
    assert.ok(top.score_total >= 5.0, `top candidate score ${top.score_total} should be >= 5.0`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('idea-scorer: deterministic — same input produces same output', () => {
  const outA = mkdtempSync(join(tmpdir(), 'scorer-a-'));
  const outB = mkdtempSync(join(tmpdir(), 'scorer-b-'));
  try {
    execFileSync('node', ['agents/scripts/idea-scorer.js', '--in', FIXTURE, '--out', outA], { encoding: 'utf8' });
    execFileSync('node', ['agents/scripts/idea-scorer.js', '--in', FIXTURE, '--out', outB], { encoding: 'utf8' });

    const a = JSON.parse(readFileSync(join(outA, `${FIXTURE_SLOT}.json`), 'utf8'));
    const b = JSON.parse(readFileSync(join(outB, `${FIXTURE_SLOT}.json`), 'utf8'));

    assert.equal(a.candidates.length, b.candidates.length);
    for (let i = 0; i < a.candidates.length; i++) {
      assert.equal(a.candidates[i].id, b.candidates[i].id);
      assert.equal(a.candidates[i].score_total, b.candidates[i].score_total);
    }
  } finally {
    rmSync(outA, { recursive: true, force: true });
    rmSync(outB, { recursive: true, force: true });
  }
});

test('idea-scorer: rejects missing input file with non-zero exit', () => {
  let exitCode = 0;
  try {
    execFileSync('node', ['agents/scripts/idea-scorer.js', '--in', 'nonexistent.json'], { encoding: 'utf8' });
  } catch (e) {
    exitCode = e.status || 1;
  }
  assert.notEqual(exitCode, 0, `expected non-zero exit, got ${exitCode}`);
});
