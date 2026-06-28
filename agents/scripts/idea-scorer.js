#!/usr/bin/env node
// idea-scorer.js — deterministic scorer. No LLM in the loop.
//
// Usage:
//   node idea-scorer.js --in docs/research/2026-W26.json --out docs/ideas/

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv, exit } from 'node:process';
import Ajv from 'ajv';
import rubric from '../contracts/scoring-rubric.v1.json' with { type: 'json' };
import poolSchema from '../contracts/idea-pool.schema.json' with { type: 'json' };

const args = parseArgs(argv.slice(2));
if (!args.in) {
  console.error('required: --in <research-snapshot.json>');
  exit(2);
}

const inPath = args.in;
const outDir = args.out || 'docs/ideas';

const research = JSON.parse(await readFile(inPath, 'utf8'));
const week = research.week;
const lookback = rubric.deduplication.lookback_weeks;
const priorPools = await loadPriorPools(outDir, week, lookback);

const candidates = scoreAll(research, priorPools, rubric);

const out = {
  week,
  scored_at: new Date().toISOString(),
  rubric_version: rubric.version,
  candidates,
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(poolSchema);
if (!validate(out)) {
  console.error('idea-pool schema invalid:', JSON.stringify(validate.errors, null, 2));
  exit(2);
}

await mkdir(outDir, { recursive: true });
const outFile = join(outDir, `${week}.json`);
await writeFile(outFile, JSON.stringify(out, null, 2));

const top = candidates[0];
console.log(`score · ${week} · ${candidates.length}/${countInputEntries(research)} candidates · top: ${top?.name || '(none)'} (${top?.score_total?.toFixed(2) || 'n/a'})`);
exit(0);

// ─── scoring ────────────────────────────────────────────────────────────────

function scoreAll(research, priorPools, rubric) {
  const out = [];
  for (const [srcKey, source] of Object.entries(research.sources || {})) {
    if (!source.entries) continue;
    for (const e of source.entries) {
      const candidate = scoreOne(e, srcKey, rubric, priorPools);
      if (candidate.score_total >= rubric.thresholds.min_score_for_idea_pool) {
        out.push(candidate);
      }
    }
  }
  out.sort((a, b) => b.score_total - a.score_total);
  return out.slice(0, 50);
}

function scoreOne(entry, sourceKey, rubric, priorPools) {
  const id = slugify(entry.title || entry.source_id || 'unknown').slice(0, 40);
  const demand = scoreDemand(entry, sourceKey, rubric.axes.demand);
  const audience = inferAudience(entry);
  const wtp = lookupTier(rubric.axes.wtp.tiers, audience);
  const buildability = scoreBuildability(entry, rubric.axes.buildability);
  const defensibility = scoreDefensibility(entry, rubric.axes.defensibility);
  const total =
    demand * rubric.weights.demand +
    wtp * rubric.weights.wtp +
    buildability * rubric.weights.buildability +
    defensibility * rubric.weights.defensibility;

  const dedup = computeDedup(id, entry, priorPools, rubric.deduplication.jaccard_threshold);

  return {
    id,
    name: entry.title || id,
    pitch: (entry.title || '').slice(0, 200),
    pain: (entry.title || '').slice(0, 280),
    source_refs: [{ source: sourceKey, source_id: entry.source_id, url: entry.url }],
    scores: { demand, wtp, buildability, defensibility },
    score_total: round2(total),
    monetization_hint: rubric.monetization_models[audience] || rubric.monetization_models.consumer_productivity,
    dedup_state: dedup,
  };
}

function scoreDemand(entry, sourceKey, demandAxis) {
  // Map source → which demand signal to use.
  const sourceToSignal = {
    cws_productivity: 'cws_installs',
    cws_devtools: 'cws_installs',
    hn_show_hn: 'hn_points',
    reddit_chrome_extensions: 'reddit_score',
    reddit_sideproject: 'reddit_score',
    reddit_internet_is_beautiful: 'reddit_score',
  };
  const signalName = sourceToSignal[sourceKey];
  if (!signalName) return 1;
  const signal = demandAxis.signals.find(s => s.source === signalName);
  if (!signal) return 1;

  // Pick the metric from the entry's `metric` map.
  const metricKey = {
    cws_installs: 'install_count',
    cws_rating: 'rating_count',
    hn_points: 'points',
    reddit_score: 'score',
  }[signalName];
  const value = Number(entry.metric?.[metricKey] || 0);

  for (const bucket of signal.scoring.buckets) {
    const max = bucket.max ?? Infinity;
    if (value >= bucket.min && value <= max) return bucket.score;
  }
  return 1;
}

function inferAudience(entry) {
  const t = (entry.title || '').toLowerCase();
  if (/\b(scrap|extract|linkedin|lead|prospect|outreach|enrich)\b/.test(t)) return 'b2b_sales';
  if (/\b(ci|cd|k8s|deploy|github|git|linter|devtool|debugger|inspector)\b/.test(t)) return 'b2b_devtool';
  if (/\b(ai|gpt|summary|transcribe|meeting|chatgpt|claude|gemini)\b/.test(t)) return 'consumer_ai_wrapper';
  if (/\b(privacy|tracker|ad[- ]?block|vpn|fingerprint|cookie)\b/.test(t)) return 'consumer_privacy';
  if (/\b(tab|screenshot|clipper|bookmark|note|task|todo|reminder)\b/.test(t)) return 'consumer_productivity';
  if (/\b(json|regex|color|userstyle|userscript|formatter)\b/.test(t)) return 'developer_internal';
  return 'consumer_productivity';
}

function lookupTier(tiers, audience) {
  const t = tiers.find(x => x.audience === audience);
  return t?.score ?? 3;
}

function scoreBuildability(entry, axis) {
  const t = (entry.title || '').toLowerCase();
  let s = axis.base_score;
  for (const f of axis.factors) {
    const re = new RegExp(`\\b${f.name.replace(/_/g, '[-_ ]?')}\\b`);
    if (re.test(t)) s += f.delta;
  }
  return clamp(s, 0, 10);
}

function scoreDefensibility(entry, axis) {
  const t = (entry.title || '').toLowerCase();
  if (/(ai|gpt|claude|gemini)/.test(t)) return axis.factors.find(f => f.moat === 'hard_clone').score;
  if (/(aggregator|search|directory)/.test(t)) return axis.factors.find(f => f.moat === 'trivial_clone').score;
  if (/(dashboard|workflow|automation)/.test(t)) return axis.factors.find(f => f.moat === 'moderate_clone').score;
  return axis.factors.find(f => f.moat === 'none').score;
}

function computeDedup(id, entry, priorPools, threshold) {
  const myTokens = tokenize(entry.title || '');
  let nearest = '';
  let bestJac = 0;
  for (const pool of priorPools) {
    for (const c of pool.candidates || []) {
      const theirTokens = tokenize(c.name);
      const j = jaccard(myTokens, theirTokens);
      if (j > bestJac) {
        bestJac = j;
        nearest = c.id || '';
      }
    }
  }
  return {
    is_duplicate: bestJac >= threshold,
    nearest_match_id: nearest,
    jaccard_with_nearest: round2(bestJac),
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function tokenize(s) {
  return new Set((s || '').toLowerCase().split(/\W+/).filter(w => w.length >= 3));
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round2(n) { return Math.round(n * 100) / 100; }

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
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

async function loadPriorPools(outDir, currentWeek, lookbackWeeks) {
  // Read all prior week files in outDir; exclude currentWeek.
  // Cap to lookbackWeeks most recent by filename order (YYYY-Www sorts lexically).
  let files = [];
  try {
    files = (await readdir(outDir)).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
  files = files.filter(f => !f.startsWith(currentWeek)).sort().slice(-lookbackWeeks);
  const pools = [];
  for (const f of files) {
    try {
      pools.push(JSON.parse(await readFile(join(outDir, f), 'utf8')));
    } catch {
      // skip malformed
    }
  }
  return pools;
}

function countInputEntries(research) {
  let n = 0;
  for (const s of Object.values(research.sources || {})) {
    n += s.entries?.length || 0;
  }
  return n;
}
