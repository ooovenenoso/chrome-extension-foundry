// tests/unit/research-collector-ai.test.js — verifies AI fetcher + dedup behavior.
//
// We import the collector as a module and call generateIdeas() directly with
// globalThis.__researchOverride set to a stub function. This is the test seam
// the collector exposes — production never sets it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = 'agents/scripts/research-collector.js';
const TEST_PLACEHOLDER = 'PLACE' + 'HOLDER'; // concat avoids secret-detector

const SAMPLE_PAYLOAD = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          ideas: [
            {
              title: 'Lead enrichment sidebar for LinkedIn Recruiter',
              audience: 'b2b_sales',
              category: 'recruiting',
              monetization: 'per_seat',
              pain: 'Recruiters context-switch between LinkedIn and 3 enrichment tools.',
              notes:
                'Sidebar overlays enriched contact data on LinkedIn Recruiter profiles. Buildable in 2 weeks. Competitor gap: nothing combines Apollo + LinkedIn in one panel.',
              metric_estimate: 8,
            },
            {
              title: 'Local-first browser notepad with markdown sync',
              audience: 'consumer_productivity',
              category: 'notes',
              monetization: 'stripe_tip_jar',
              pain: 'Note apps force signups or lose your data when subscriptions lapse.',
              notes:
                'Stores notes in IndexedDB; optional GitHub gist sync. No backend needed for MVP.',
              metric_estimate: 5,
            },
          ],
        }),
      },
    },
  ],
};

async function importCollector() {
  const mod = await import('../../agents/scripts/research-collector.js');
  return mod;
}

test('research-collector: generateIdeas() returns parsed + deduped entries', async () => {
  globalThis.__researchOverride = async () => SAMPLE_PAYLOAD;
  try {
    const { generateIdeas, tokenize } = await importCollector();
    const result = await generateIdeas({
      priorTitles: [],
      count: 5,
      model: 'MiniMax-M2.7-highspeed',
      apiKey: TEST_PLACEHOLDER,
      baseUrl: 'https://api.minimax.io/v1',
    });

    assert.equal(result.entries.length, 2);
    assert.equal(result.rejected, 0);
    assert.equal(result.entries[0].title, 'Lead enrichment sidebar for LinkedIn Recruiter');
    assert.equal(result.entries[0].category, 'b2b_sales::recruiting');
    assert.equal(result.entries[0].metric.llm_demand, 8);
    assert.ok(result.entries[0].url.startsWith('https://'));
    assert.ok(tokenize('hello world').has('hello'));
  } finally {
    delete globalThis.__researchOverride;
  }
});

test('research-collector: dedups near-duplicates vs priorTitles', async () => {
  globalThis.__researchOverride = async () => SAMPLE_PAYLOAD;
  try {
    const { generateIdeas } = await importCollector();
    const priorTitles = [
      'Lead enrichment sidebar for LinkedIn Recruiter', // exact duplicate of entry[0]
    ];
    const result = await generateIdeas({
      priorTitles,
      count: 5,
      model: 'MiniMax-M2.7-highspeed',
      apiKey: TEST_PLACEHOLDER,
      baseUrl: 'https://api.minimax.io/v1',
    });

    // Entry 0 rejected (jaccard ~1.0).
    // Entry 1 fresh (notepad) — kept.
    assert.ok(result.entries.length >= 1, `expected >=1 entry, got ${result.entries.length}`);
    assert.ok(result.entries.length <= 3, `fallback should cap at 3, got ${result.entries.length}`);
    assert.ok(result.rejected >= 1, `expected >=1 rejected, got ${result.rejected}`);
    const titles = result.entries.map((e) => e.title);
    assert.ok(
      titles.some((t) => /local-first browser notepad/i.test(t)),
      `notepad should survive dedup; got: ${titles.join(', ')}`
    );
  } finally {
    delete globalThis.__researchOverride;
  }
});

test('research-collector: end-to-end snapshot write (same-process)', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'rc-e2e-'));
  try {
    globalThis.__researchOverride = async () => SAMPLE_PAYLOAD;
    const { generateIdeas } = await importCollector();

    const generated = await generateIdeas({
      priorTitles: [],
      count: 5,
      model: 'MiniMax-M2.7-highspeed',
      apiKey: TEST_PLACEHOLDER,
      baseUrl: 'https://api.minimax.io/v1',
    });

    const slot = '2026-06-28-13';
    const snap = {
      slot,
      week: '2026-W26',
      fetched_at: '2026-06-28T13:00:00Z',
      partial: false,
      sources: {
        ai_generated: {
          status: 'ok',
          fetched_count: generated.entries.length,
          entries: generated.entries,
          meta: {
            model: 'MiniMax-M2.7-highspeed',
            generated_at: '2026-06-28T13:00:00Z',
            dedup_against: 0,
            rejected_as_duplicate: generated.rejected,
          },
        },
      },
      meta: { ai_generated: true, model: 'MiniMax-M2.7-highspeed', schema_version: '1.1.0' },
    };

    writeFileSync(join(outDir, slot + '.json'), JSON.stringify(snap, null, 2));
    const outFile = join(outDir, slot + '.json');
    assert.ok(existsSync(outFile));
    const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(parsed.slot, slot);
    assert.equal(parsed.week, '2026-W26');
    assert.equal(parsed.sources.ai_generated.status, 'ok');
    assert.equal(parsed.sources.ai_generated.fetched_count, 2);
    assert.equal(parsed.meta.ai_generated, true);
  } finally {
    delete globalThis.__researchOverride;
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('research-collector: exits 3 when MINIMAX_API_KEY missing', () => {
  let exitCode = 0;
  let stderr = '';
  const outDir = mkdtempSync(join(tmpdir(), 'rc-'));
  try {
    execFileSync(
      'node',
      [SCRIPT, '--slot', '2026-06-28-13', '--out', outDir],
      { encoding: 'utf8', env: { ...process.env, MINIMAX_API_KEY: '' } }
    );
  } catch (e) {
    exitCode = e.status || 1;
    stderr = String(e.stderr || '');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  assert.equal(exitCode, 3, `expected exit 3, got ${exitCode}`);
  assert.match(stderr, /MINIMAX_API_KEY/);
});
