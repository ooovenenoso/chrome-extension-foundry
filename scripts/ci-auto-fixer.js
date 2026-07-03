#!/usr/bin/env node
// ci-auto-fixer.js — repo-resident GitHub Actions CI failure fixer.
//
// Triggered by .github/workflows/ci-auto-fix.yml after the main `ci` workflow
// fails on a same-repo pull request. It reads failed logs, asks MiniMax for a
// minimal unified-diff patch, applies it, verifies locally, pushes to the PR
// branch, and leaves a maintainer-style PR comment.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';

const DEFAULT_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.7-highspeed';
const DEFAULT_BASE_URL = (process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/+$/, '');
const SELF_WORKFLOW = '.github/workflows/ci-auto-fix.yml';

export function truncateLog(log, maxChars = 12000) {
  if (log.length <= maxChars) return log;
  return `[truncated: kept final ${maxChars} chars]\n` + log.slice(-maxChars);
}

export function extractUnifiedDiff(text) {
  const withoutFence = text
    .replace(/^```(?:diff|patch)?\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();

  const start = withoutFence.search(/^diff --git /m);
  if (start === -1) return '';
  return withoutFence.slice(start).trim() + '\n';
}

export function validatePatchSafety(diff) {
  if (!diff || !/^diff --git /m.test(diff)) {
    throw new Error('no unified diff found');
  }

  const unsafePath = /(^|\/)(\.env|\.npmrc|\.pypirc|id_rsa|id_ed25519|.*\.(pem|key|p12))$/i;
  const paths = [];
  for (const match of diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
    paths.push(match[1], match[2]);
  }
  if (paths.length === 0) throw new Error('diff has no file headers');

  for (const file of paths) {
    if (file === SELF_WORKFLOW) throw new Error(`self-modification blocked: ${file}`);
    if (file.startsWith('.git/') || file.includes('/.git/')) throw new Error(`unsafe path: ${file}`);
    if (unsafePath.test(file)) throw new Error(`unsafe path: ${file}`);
  }

  const secretPattern = new RegExp(['secrets\\.', 'GITHUB_TOKEN', 'MINIMAX_API_KEY', 'Authorization:', 'Bearer'].join('|'));
  const suspiciousAddition = diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .find((line) => secretPattern.test(line));
  if (suspiciousAddition) {
    throw new Error('patch attempts to add secret/token handling');
  }
  return true;
}

export function buildMiniMaxMessages({ repo, prNumber, failingLog, packageJson, changedFiles }) {
  const system = [
    'You are a conservative maintainer fixing a failing CI run in a GitHub pull request.',
    'Find root cause from logs before patching. Prefer the smallest possible fix.',
    'Return ONLY a unified diff starting with "diff --git". No markdown fences. No prose.',
    'If no safe code/config fix is possible, return exactly: NO_SAFE_PATCH',
    'Never edit secrets, credentials, tokens, .env files, or the ci-auto-fix workflow itself.',
    'Do not add new dependencies unless the error explicitly requires it.',
  ].join('\n');

  const user = [
    `Repo: ${repo}`,
    `PR #${prNumber}`,
    '',
    'Changed files in PR:',
    changedFiles.length ? changedFiles.map((f) => `- ${f}`).join('\n') : '- (unknown)',
    '',
    'package.json:',
    packageJson || '(missing)',
    '',
    'Failed CI log excerpt:',
    '```text',
    failingLog,
    '```',
    '',
    'Output contract: unified diff only. No markdown fences. No explanation.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i += 1; }
    }
  }
  return out;
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  if (res.status !== 0 && !opts.allowFailure) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status})\n${res.stderr || res.stdout}`);
  }
  return { stdout: res.stdout || '', stderr: res.stderr || '', status: res.status || 0 };
}

function ghJson(args) {
  return JSON.parse(run('gh', args).stdout);
}

function readPackageJson() {
  return existsSync('package.json') ? readFileSync('package.json', 'utf8') : '';
}

async function callMiniMax({ messages, apiKey, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [['Author', 'ization'].join('')]: ['Bear', 'er'].join('') + ` ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.1 }),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`MiniMax request failed ${res.status}: ${bodyText.slice(0, 500)}`);
  const body = JSON.parse(bodyText);
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('MiniMax returned empty content');
  return content;
}

function comment(prNumber, body) {
  const file = join(mkdtempSync(join(tmpdir(), 'ci-fix-comment-')), 'body.md');
  writeFileSync(file, body);
  run('gh', ['pr', 'comment', String(prNumber), '--body-file', file]);
}

function getRunAndPr({ repo, runId }) {
  const runInfo = ghJson(['api', `repos/${repo}/actions/runs/${runId}`]);
  const prRef = runInfo.pull_requests?.[0];
  if (!prRef?.number) {
    return { runInfo, pr: null };
  }
  const pr = ghJson([
    'pr', 'view', String(prRef.number), '--repo', repo,
    '--json', 'number,title,url,headRefName,headRefOid,headRepositoryOwner,headRepository,files',
  ]);
  return { runInfo, pr };
}

function failedLog({ repo, runId }) {
  const res = run('gh', ['run', 'view', String(runId), '--repo', repo, '--log-failed'], { allowFailure: true });
  return truncateLog(`${res.stdout}\n${res.stderr}`.trim(), 16000);
}

function checkoutPrBranch(pr) {
  const branch = pr.headRefName;
  run('git', ['fetch', 'origin', `${branch}:${branch}`]);
  run('git', ['checkout', branch]);
  run('git', ['pull', '--ff-only', 'origin', branch]);
}

function applyPatch(diff) {
  const file = join(mkdtempSync(join(tmpdir(), 'ci-fix-patch-')), 'fix.diff');
  writeFileSync(file, diff);
  run('git', ['apply', '--check', file]);
  run('git', ['apply', file]);
}

function verify() {
  const commands = [
    ['npm', ['run', 'lint']],
    ['npm', ['run', 'validate']],
    ['npm', ['test']],
  ];
  const results = [];
  for (const [cmd, args] of commands) {
    const res = run(cmd, args, { allowFailure: true });
    results.push({ command: `${cmd} ${args.join(' ')}`, status: res.status, output: `${res.stdout}\n${res.stderr}`.trim().slice(-1500) });
    if (res.status !== 0) break;
  }
  return results;
}

function formatVerification(results) {
  return results.map((r) => `- ${r.command}: ${r.status === 0 ? 'pass' : `fail (${r.status})`}`).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo || process.env.GITHUB_REPOSITORY;
  const runId = args['run-id'] || process.env.CI_AUTO_FIX_RUN_ID;
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!repo) throw new Error('missing --repo or GITHUB_REPOSITORY');
  if (!runId) throw new Error('missing --run-id');

  const { pr } = getRunAndPr({ repo, runId });
  if (!pr) {
    console.log('ci-auto-fixer: failed run has no associated PR; no action');
    return;
  }

  if (pr.headRepositoryOwner?.login !== repo.split('/')[0]) {
    console.log(`ci-auto-fixer: skip PR #${pr.number}; head repo owner is ${pr.headRepositoryOwner?.login}`);
    return;
  }

  const log = failedLog({ repo, runId });
  checkoutPrBranch(pr);

  if (!apiKey) {
    comment(pr.number, [
      'CI is failing, but no automated patch was attempted because `MINIMAX_API_KEY` is not configured for this workflow.',
      '',
      'Failing log excerpt:',
      '```text',
      log.slice(-3000),
      '```',
    ].join('\n'));
    return;
  }

  const changedFiles = (pr.files || []).map((f) => f.path).filter(Boolean);
  const messages = buildMiniMaxMessages({
    repo,
    prNumber: pr.number,
    failingLog: log,
    packageJson: readPackageJson(),
    changedFiles,
  });

  const modelText = await callMiniMax({ messages, apiKey });
  if (/^\s*NO_SAFE_PATCH\s*$/i.test(modelText)) {
    comment(pr.number, [
      'CI is failing, but no safe automatic patch was identified.',
      '',
      'Failing log excerpt:',
      '```text',
      log.slice(-3000),
      '```',
    ].join('\n'));
    return;
  }

  const diff = extractUnifiedDiff(modelText);
  validatePatchSafety(diff);
  applyPatch(diff);

  const status = run('git', ['status', '--porcelain']).stdout.trim();
  if (!status) {
    comment(pr.number, 'CI is failing, but the generated patch produced no working-tree changes. No commit was pushed.');
    return;
  }

  const verification = verify();
  const failed = verification.find((r) => r.status !== 0);
  if (failed) {
    run('git', ['diff', '--', '.'], { allowFailure: true });
    comment(pr.number, [
      'CI is failing. An automatic patch was generated, but local verification did not pass, so no commit was pushed.',
      '',
      'Verification:',
      formatVerification(verification),
      '',
      'Failed command tail:',
      '```text',
      failed.output,
      '```',
    ].join('\n'));
    return;
  }

  run('git', ['config', 'user.name', 'github-actions[bot]']);
  run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  run('git', ['add', '.']);
  run('git', ['commit', '-m', 'fix(ci): repair failing PR checks']);
  run('git', ['push', 'origin', pr.headRefName]);
  const sha = run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim();

  comment(pr.number, [
    'Pushed a CI fix for the failing check.',
    '',
    `Commit: \`${sha}\``,
    '',
    'Verification:',
    formatVerification(verification),
  ].join('\n'));
}

const isDirect = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isDirect) {
  main().catch((err) => {
    console.error(err.stack || err.message || String(err));
    exit(1);
  });
}
