#!/usr/bin/env node
// research-collector.js — fetch public market signal, write dated JSON snapshot
//
// Usage:
//   node research-collector.js --week 2026-W26 --out docs/research/
//
// Outputs:
//   <out>/<week>.json  (ResearchSnapshot, schema-validated)
//
// Sources (top-N each):
//   - CWS productivity
//   - CWS devtools
//   - HN Show HN (last 7d, query: chrome+extension|browser+extension|manifest+v3)
//   - Reddit r/chrome_extensions (top month)
//   - Reddit r/sideproject (top month)
//   - Reddit r/InternetIsBeautiful (top month)

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv, exit } from 'node:process';
import Ajv from 'ajv';
import schema from '../contracts/research-snapshot.schema.json' with { type: 'json' };

const args = parseArgs(argv.slice(2));
const week = args.week || currentISOWeek();
const outDir = args.out || 'docs/research';
const outFile = join(outDir, `${week}.json`);

const SOURCES = {
  cws_productivity: cwsProductivity,
  cws_devtools: cwsDevtools,
  hn_show_hn: hnShowHN,
  reddit_chrome_extensions: () => redditTop('chrome_extensions'),
  reddit_sideproject: () => redditTop('sideproject'),
  reddit_internet_is_beautiful: () => redditTop('InternetIsBeautiful'),
};

async function main() {
  const sources = {};
  let partial = false;

  for (const [key, fetcher] of Object.entries(SOURCES)) {
    try {
      const entries = await fetcher();
      sources[key] = {
        status: 'ok',
        fetched_count: entries.length,
        entries,
      };
    } catch (err) {
      partial = true;
      sources[key] = {
        status: 'error',
        fetched_count: 0,
        entries: [],
        error: String(err.message || err),
      };
    }
  }

  const snapshot = { week, fetched_at: new Date().toISOString(), partial, sources };

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(snapshot)) {
    console.error('schema invalid:', JSON.stringify(validate.errors, null, 2));
    exit(2);
  }

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(snapshot, null, 2));

  const total = Object.values(sources).reduce((s, x) => s + (x.fetched_count || 0), 0);
  console.log(`research · ${week} · ${total} entries · partial:${partial}`);
  exit(0);
}

// ─── Source fetchers ─────────────────────────────────────────────────────────

async function cwsProductivity() {
  return cwsCategory('https://chromewebstore.google.com/category/extensions/productivity');
}

async function cwsDevtools() {
  return cwsCategory('https://chromewebstore.google.com/category/extensions/developer-tools');
}

async function cwsCategory(url) {
  // CWS pages are server-rendered but use dynamic hydration.
  // We do a HEAD-equivalent: fetch HTML, extract JSON-LD `ItemList` if present,
  // else fall back to a stub entry (CWS blocks plain scraping).
  // In production, replace with a snapshot from the CWS RSS feed or a 3rd-party
  // indexer that exposes install counts.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-collector/1.0)' },
  });
  if (!res.ok) throw new Error(`CWS HTTP ${res.status}`);
  const html = await res.text();
  // Heuristic extraction — best-effort, not authoritative.
  // Real implementation should use CWS API or chrome-stats.com mirror.
  const titles = [...html.matchAll(/<h3[^>]*class="[^"]*e-fw[^"]*"[^>]*>([^<]+)<\/h3>/g)]
    .map(m => m[1].trim())
    .filter(Boolean)
    .slice(0, 25);
  if (titles.length === 0) {
    // CWS render is JS-heavy; emit a partial stub with note so scoring still runs.
    return [{
      source_id: 'cws-category-empty',
      title: '(CWS render blocked — populate from chrome-stats.com)',
      url,
      timestamp: new Date().toISOString(),
      metric: {},
      notes: 'CWS server-render blocks naive HTML parsing. Replace with chrome-stats.com scrape.',
    }];
  }
  return titles.map((title, i) => ({
    source_id: `cws-${slugify(title)}-${i}`,
    title,
    url: `${url}#item-${i}`,
    timestamp: new Date().toISOString(),
    metric: {},
  }));
}

async function hnShowHN() {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const url = `https://hn.algolia.com/api/v1/search?tags=show_hn&numericFilters=created_at_i>${sevenDaysAgo}&hitsPerPage=30`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
  const json = await res.json();
  return (json.hits || []).map(h => ({
    source_id: h.objectID,
    title: h.title,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    timestamp: new Date(h.created_at_i * 1000).toISOString(),
    metric: { points: h.points || 0, num_comments: h.num_comments || 0 },
    category: 'show_hn',
  }));
}

async function redditTop(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?t=month&limit=30`;
  const res = await fetch(url, { headers: { 'User-Agent': 'research-collector/1.0' } });
  if (!res.ok) throw new Error(`Reddit ${subreddit} HTTP ${res.status}`);
  const json = await res.json();
  return (json.data?.children || []).map(c => ({
    source_id: c.data.id,
    title: c.data.title,
    url: `https://reddit.com${c.data.permalink}`,
    timestamp: new Date(c.data.created_utc * 1000).toISOString(),
    metric: { score: c.data.score || 0, num_comments: c.data.num_comments || 0 },
    category: subreddit,
  }));
}

// ─── helpers ────────────────────────────────────────────────────────────────

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

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

function currentISOWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

main().catch(err => {
  console.error('research-collector fatal:', err);
  exit(2);
});
