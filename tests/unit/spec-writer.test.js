// tests/unit/spec-writer.test.js — verifies spec-writer rejects correctly and writes files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXTURE = 'tests/fixtures/contracts/idea-pool.fixture.json';

test('spec-writer: writes GOAL.md + BACKLOG.md for top candidate', () => {
  // The fixture's top candidate has score_total=6.4 — under threshold (7.0). So we
  // need a fixture with ≥7.0 to test the success path. Create one inline.
  const highScoreFixture = {
    week: '2026-W26',
    scored_at: '2026-06-28T13:05:00Z',
    rubric_version: '1.0.0',
    candidates: [
      {
        id: 'fixture-high-score',
        name: 'Fixture Top Idea',
        pitch: 'A pitch long enough to pass the rejection check, definitely more than fifty chars.',
        pain: 'A pain statement long enough to pass the rejection check, definitely more than eighty characters.',
        source_refs: [{ source: 'hn_show_hn', source_id: 'h1', url: 'https://hn.com/1' }],
        scores: { demand: 9, wtp: 9, buildability: 8, defensibility: 8 },
        score_total: 8.55,
        monetization_hint: { audience: 'b2b_devtool', model: 'Freemium → SaaS bridge', tier: 'freemium_saas', monthly_price_usd: 15 },
        dedup_state: { is_duplicate: false, nearest_match_id: null, jaccard_with_nearest: 0 }
      }
    ]
  };

  const tmp = mkdtempSync(join(tmpdir(), 'spec-'));
  const outDir = mkdtempSync(join(tmpdir(), 'spec-out-'));
  const ideaFile = join(tmp, 'idea.json');
  writeFileSync(ideaFile, JSON.stringify(highScoreFixture));
  try {
    execFileSync('node', ['agents/scripts/spec-writer.js', '--idea', ideaFile, '--top', '1', '--out', outDir], { encoding: 'utf8' });

    const goalPath = join(outDir, 'fixture-high-score', 'GOAL.md');
    const backlogPath = join(outDir, 'fixture-high-score', 'BACKLOG.md');

    assert.ok(existsSync(goalPath), 'GOAL.md exists');
    assert.ok(existsSync(backlogPath), 'BACKLOG.md exists');

    const goal = readFileSync(goalPath, 'utf8');
    for (const s of ['§1', '§2', '§3', '§4', '§5', '§6', '§7', '§8', '§9', '§10']) {
      assert.ok(goal.includes(`## ${s}`), `GOAL.md contains section ${s}`);
    }
    const wc = goal.split(/\s+/).filter(Boolean).length;
    assert.ok(wc <= 2500, `GOAL.md body ≤ 2500 words (got ${wc})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('spec-writer: rejects low-score candidates with exit 1', () => {
  // Use the standard fixture — its top candidate scores 6.4 < 7.0
  const tmp = mkdtempSync(join(tmpdir(), 'spec-rej-'));
  const outDir = mkdtempSync(join(tmpdir(), 'spec-rej-out-'));
  const ideaFile = join(tmp, 'idea.json');
  writeFileSync(ideaFile, JSON.stringify(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
  try {
    let combined = '';
    let exitCode = 0;
    try {
      const out = execFileSync('node', ['agents/scripts/spec-writer.js', '--idea', ideaFile, '--top', '1', '--out', outDir], { encoding: 'utf8' });
      combined = out;
    } catch (e) {
      combined = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
      exitCode = e.status || 1;
    }
    assert.equal(exitCode, 1, `expected exit 1, got ${exitCode}`);
    assert.match(combined, /rejected|score/i, 'output mentions rejection reason');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});
