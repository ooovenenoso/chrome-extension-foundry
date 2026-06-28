#!/usr/bin/env node
// research-collector.js — AI-generated market signal + dedup vs. history.
//
// Usage:
//   node agents/scripts/research-collector.js \
//     --slot 2026-06-28-13 --out docs/research/ \
//     --model MiniMax-M2.7-highspeed --count 10
//
// Outputs:
//   <out>/<slot>.json  (ResearchSnapshot, schema-validated)
//
// Source (single):
//   - ai_generated: MiniMax chat completions, JSON-mode, structured prompts.
//                  Reads prior snapshots from <out>/ and feeds titles into
//                  the prompt as the no-repeat list.
//                  Post-filters duplicates by Jaccard similarity.
//
// Environment:
//   MINIMAX_API_KEY   required (overridable via --api-key)
//   MINIMAX_BASE_URL  optional, default https://api.minimax.io/v1
//
// Failure modes:
//   - Missing API key: exit 3, clear stderr message.
//   - LLM returns invalid JSON or wrong shape: exit 4, snapshot written with
//     ai_generated.status=error, top-level partial=true.
//   - Schema failure: exit 2.

import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv, exit } from 'node:process';
import Ajv from 'ajv';
import schema from '../contracts/research-snapshot.schema.json' with { type: 'json' };

const args = parseArgs(argv.slice(2));
const slot = args.slot || currentSlot();
const outDir = args.out || 'docs/research';
const outFile = join(outDir, `${slot}.json`);
const model = args.model || process.env.MINIMAX_MODEL || 'MiniMax-M2.7-highspeed';
const count = clampInt(args.count, 1, 50, 10);
const apiKey = args['api-key'] || process.env.MINIMAX_API_KEY || '';
const baseUrl = (args['base-url'] || process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/+$/, '');
const lookbackSlots = clampInt(args['lookback'], 1, 500, 60);

async function main() {
  if (!apiKey) {
    console.error('research-collector: MINIMAX_API_KEY not set (env or --api-key)');
    exit(3);
  }
  const priorTitles = await loadPriorTitles(outDir, slot, lookbackSlots);

  let aiSource;
  let partial = false;
  try {
    const generated = await generateIdeas({ priorTitles, count, model, apiKey, baseUrl });
    aiSource = {
      status: 'ok',
      fetched_count: generated.entries.length,
      entries: generated.entries,
      meta: {
        model,
        generated_at: new Date().toISOString(),
        dedup_against: priorTitles.length,
        rejected_as_duplicate: generated.rejected,
      },
    };
  } catch (err) {
    partial = true;
    aiSource = {
      status: 'error',
      fetched_count: 0,
      entries: [],
      error: String(err.message || err),
      meta: { model, generated_at: new Date().toISOString(), dedup_against: priorTitles.length },
    };
  }

  const snapshot = {
    slot,
    week: slotToIsoWeek(slot),
    fetched_at: new Date().toISOString(),
    partial,
    sources: { ai_generated: aiSource },
    meta: { ai_generated: true, model, schema_version: '1.1.0' },
  };

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(snapshot)) {
    console.error('schema invalid:', JSON.stringify(validate.errors, null, 2));
    exit(2);
  }

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(snapshot, null, 2));

  const total = aiSource.fetched_count || 0;
  console.log(
    `research · ${slot} · ${total} entries · partial:${partial} · ` +
      `model:${model} · rejected:${aiSource.meta.rejected_as_duplicate ?? 0}`
  );
  exit(0);
}

// ─── AI fetcher ────────────────────────────────────────────────────────────

async function generateIdeas({ priorTitles, count, model, apiKey, baseUrl }) {
  const system = buildSystemPrompt(count);
  const user = buildUserPrompt({ count, priorTitles });

  // Test seam: tests can inject a canned response by setting
  // globalThis.__researchOverride(payloadObject) before requiring this script.
  // Production never sets this.
  let body;
  if (typeof globalThis.__researchOverride === 'function') {
    body = await globalThis.__researchOverride({ system, user, model });
  } else {
    body = await callMiniMax({ system, user, model, apiKey, baseUrl });
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('MiniMax returned empty content');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`MiniMax JSON parse failed: ${e.message}; head=${content.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.ideas)) {
    throw new Error(
      `MiniMax JSON shape missing 'ideas' array; got keys=${Object.keys(parsed)}`
    );
  }

  const raw = parsed.ideas.map(normalizeIdea).filter(Boolean);

  // Dedup against prior snapshots by Jaccard over (title + notes).
  const kept = [];
  const rejected = [];
  for (const idea of raw) {
    // Dedup compares title-only tokens against prior title tokens.
    // This is conservative and robust: notes/pain are noisy across runs but
    // the title is the strongest signal. Jaccard threshold 0.75 catches
    // near-duplicates without being overly aggressive on similar verticals.
    const myTokens = tokenize(idea.title);
    let bestJac = 0;
    let bestPrior = '';
    for (const prior of priorTitles) {
      const priorTokens = tokenize(prior);
      const j = jaccard(myTokens, priorTokens);
      if (j > bestJac) {
        bestJac = j;
        bestPrior = prior;
      }
    }
    if (bestJac >= 0.75) {
      rejected.push({ title: idea.title, jaccard: round2(bestJac), nearest_prior: bestPrior });
      continue;
    }
    kept.push(idea);
  }

  // If dedup ate everything, keep up to 3 lowest-jaccard entries as fallback.
  if (kept.length === 0 && raw.length > 0) {
    const ranked = raw
      .map((idea) => {
        const myTokens = tokenize(idea.title);
        let bestJac = 0;
        for (const prior of priorTitles) {
          const j = jaccard(myTokens, tokenize(prior));
          if (j > bestJac) bestJac = j;
        }
        return { idea, bestJac };
      })
      .sort((a, b) => a.bestJac - b.bestJac)
      .slice(0, 3);
    kept.push(...ranked.map((x) => x.idea));
  }

  return { entries: kept, rejected: rejected.length };
}

function buildSystemPrompt(count) {
  return [
    'You are a Chrome-extension idea generator for a single-engineer solo factory.',
    '',
    'Audience: Kevin runs a daily factory that finds, scores, specs, and ships monetizable Chrome extensions. Ideas must be buildable by ONE engineer in <=6 weeks, monetize via Stripe tip jar, freemium SaaS bridge, or per-seat B2B.',
    '',
    'Output rules:',
    '- Return JSON only (response_format enforces this). No prose, no markdown fences.',
    `- JSON shape: {"ideas": [<idea>, ...]} with EXACTLY ${count} ideas.`,
    '- Each idea object MUST have these keys:',
    '    title        — short, human, no emoji, <=80 chars',
    '    audience     — one of: b2b_devtool | b2b_sales | developer_internal | consumer_ai_wrapper | consumer_privacy | consumer_productivity',
    '    monetization — short model hint: stripe_tip_jar | freemium_saas | per_seat | quota_based | donation',
    '    pain         — one-sentence user pain, <=140 chars',
    '    notes        — 2-3 sentences: buildability angle + why now + competitor gap',
    '    metric_estimate — your honest guess of demand 1-10 (LLM proxy for install counts)',
    '    category     — short vertical tag, e.g. devtools, sales, ai, productivity',
    '- Avoid: generic AI summarizer (saturated), generic ad blocker, password manager, todo app, dark mode toggle.',
    '- Strong vertical preference: B2B devtools, sales/prospecting, AI wrappers for vertical SaaS, privacy, browser-side automations.',
    '- VARIETY: each idea must differ in audience OR vertical OR pain shape from prior runs.',
    '- DO NOT repeat any title from the IDEAS YA USADAS list.',
  ].join('\n');
}

function buildUserPrompt({ count, priorTitles }) {
  const priorBlock =
    priorTitles.length === 0
      ? '(no prior ideas yet — first run)'
      : priorTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return [
    `Generate exactly ${count} NEW Chrome extension ideas.`,
    '',
    '## IDEAS YA USADAS (NO REPETIR NINGUNA — must differ in title AND pain)',
    '',
    priorBlock,
    '',
    "## Today's date",
    '',
    new Date().toISOString().slice(0, 10),
    '',
    'Return JSON only.',
  ].join('\n');
}

async function callMiniMax({ system, user, model, apiKey, baseUrl }) {
  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MiniMax HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function normalizeIdea(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title || title.length > 120) return null;
  const audience = String(raw.audience || 'consumer_productivity').trim();
  const category =
    String(raw.category || 'productivity')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 32) || 'productivity';
  const monetization = String(raw.monetization || 'stripe_tip_jar').trim();
  const pain = String(raw.pain || '').trim().slice(0, 280);
  const notes = String(raw.notes || '').trim().slice(0, 600);
  const metric = Math.max(1, Math.min(10, Number(raw.metric_estimate) || 5));

  return {
    source_id: 'ai-' + slugify(title) + '-' + Math.random().toString(36).slice(2, 8),
    title,
    url: 'https://example.invalid/ai-idea/' + slugify(title),
    timestamp: new Date().toISOString(),
    metric: { llm_demand: metric },
    category: audience + '::' + category,
    notes,
    monetization,
    pain,
  };
}

// ─── history loader ────────────────────────────────────────────────────────

async function loadPriorTitles(outDir, currentSlot, lookback) {
  let files = [];
  try {
    files = (await readdir(outDir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  files = files.filter((f) => f !== currentSlot + '.json').sort().slice(-lookback);
  const titles = [];
  for (const f of files) {
    try {
      const snap = JSON.parse(await readFile(join(outDir, f), 'utf8'));
      for (const src of Object.values(snap.sources || {})) {
        for (const e of src.entries || []) {
          if (e?.title) titles.push(e.title);
        }
      }
    } catch {
      // skip malformed
    }
  }
  return titles;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function tokenize(s) {
  return new Set((s || '').toLowerCase().split(/\W+/).filter((w) => w.length >= 3));
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function clampInt(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function currentSlot() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return y + '-' + m + '-' + day + '-' + h;
}

function slotToIsoWeek(slot) {
  const m = String(slot).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 'unknown-week';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function parseArgs(arr) {
  const out = {};
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = arr[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[k] = true;
      } else {
        out[k] = next;
        i++;
      }
    }
  }
  return out;
}

import { fileURLToPath } from 'node:url';

const isEntrypoint = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  main().catch((err) => {
    console.error('research-collector fatal:', err);
    exit(2);
  });
}

// Export internals so tests can drive generateIdeas() directly via dynamic import.
export { generateIdeas, loadPriorTitles, tokenize, jaccard };
