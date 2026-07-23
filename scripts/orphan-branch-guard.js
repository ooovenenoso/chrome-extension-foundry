#!/usr/bin/env node
// orphan-branch-guard.js — find feat/mvp-* branches with no open PR for >N hours
// and either delete them (default) or report them (--dry-run).
//
// Usage:
//   node scripts/orphan-branch-guard.js [--max-age-hours 24] [--dry-run] [--prefix feat/mvp-]
//
// Environment:
//   GH_TOKEN    required (the workflow injects secrets.GITHUB_TOKEN)
//   REPO        required (owner/repo, e.g. ooovenenoso/chrome-extension-foundry)
//
// Test seam:
//   Set globalThis.__mockFetch(url, opts) → Response-like to bypass GitHub calls.
//
// Exit codes:
//   0  no orphans OR orphans deleted/listed
//   1  GitHub API error
//   2  usage error

import { argv, exit } from 'node:process';

// Note: we read process.argv.slice(2) lazily inside parseArgs() so that tests
// can shim process.argv via a globalThis shim before argv is destructured.

const args = (() => { const a = parseArgs((process.argv || []).slice(2)); return a; })();
const repo = process.env.REPO || process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const maxAgeHours = Number(args['max-age-hours'] || 24);
const prefix = args.prefix || 'feat/mvp-';
const dryRun = !!args['dry-run'];

if (!repo || !token) {
  console.error('required env: REPO, GH_TOKEN (or GITHUB_REPOSITORY, GITHUB_TOKEN)');
  exit(2);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

const cutoff = Date.now() - maxAgeHours * 3600 * 1000;

async function gh(url, opts = {}) {
  if (typeof globalThis.__mockFetch === 'function') {
    return globalThis.__mockFetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  }
  return fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
}

let page = 1;
const allBranches = [];
while (true) {
  const res = await gh(`https://api.github.com/repos/${repo}/branches?per_page=100&page=${page}`);
  if (!res.ok) {
    console.error(`branches list HTTP ${res.status}: ${await res.text()}`);
    exit(1);
  }
  const chunk = await res.json();
  if (chunk.length === 0) break;
  allBranches.push(...chunk);
  if (chunk.length < 100) break;
  page++;
}

const candidates = allBranches.filter((b) => b.name.startsWith(prefix) && b.name !== 'main');
if (candidates.length === 0) {
  console.log(`orphan-guard: 0 branches with prefix "${prefix}" found`);
  exit(0);
}

const orphans = [];
for (const b of candidates) {
  const [commitRes, prRes] = await Promise.all([
    gh(`https://api.github.com/repos/${repo}/commits/${b.name}`),
    gh(`https://api.github.com/repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${b.name}`),
  ]);
  if (!commitRes.ok) continue;
  const commit = await commitRes.json();
  const commitDate = new Date(commit.commit?.committer?.date || commit.commit?.author?.date || 0).getTime();
  const openPrs = prRes.ok ? await prRes.json() : [];
  const isOrphan = commitDate < cutoff && openPrs.length === 0;
  if (isOrphan) {
    orphans.push({ name: b.name, lastCommit: commit.commit?.committer?.date, ageHours: Math.round((Date.now() - commitDate) / 36000) / 100 });
  }
}

if (orphans.length === 0) {
  console.log(`orphan-guard: 0 orphans (${candidates.length} candidate branches scanned, all <${maxAgeHours}h old or have open PRs)`);
  exit(0);
}

if (dryRun) {
  console.log(`orphan-guard: DRY RUN — would delete ${orphans.length} orphan branches:`);
  for (const o of orphans) console.log(`  - ${o.name} (last commit ${o.ageHours}h ago)`);
  exit(0);
}

const deleted = [];
const failed = [];
for (const o of orphans) {
  const delRes = await gh(`https://api.github.com/repos/${repo}/git/refs/heads/${o.name}`, { method: 'DELETE' });
  if (delRes.ok || delRes.status === 204) {
    deleted.push(o.name);
    console.log(`orphan-guard: deleted ${o.name} (last commit ${o.ageHours}h ago)`);
  } else {
    failed.push({ name: o.name, status: delRes.status, body: (await delRes.text()).slice(0, 200) });
    console.error(`orphan-guard: failed to delete ${o.name}: HTTP ${delRes.status}`);
  }
}

const summary = {
  scanned: candidates.length,
  orphans_found: orphans.length,
  deleted: deleted.length,
  failed: failed.length,
  deleted_names: deleted,
  failed_details: failed,
  ran_at: new Date().toISOString(),
};
console.log('\n=== orphan-guard summary ===');
console.log(JSON.stringify(summary, null, 2));
exit(failed.length > 0 ? 1 : 0);

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
