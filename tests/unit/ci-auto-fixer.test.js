import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractUnifiedDiff,
  validatePatchSafety,
  buildMiniMaxMessages,
  truncateLog,
} from '../../scripts/ci-auto-fixer.js';

test('ci-auto-fixer extracts unified diff from fenced model output', () => {
  const text = [
    'Here is the fix:',
    '```diff',
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -1,3 +1,3 @@',
    '-  "test": "node tests/*.test.js"',
    '+  "test": "node --test tests/*.test.js"',
    '```',
  ].join('\n');

  const diff = extractUnifiedDiff(text);
  assert.match(diff, /^diff --git/m);
  assert.doesNotMatch(diff, /```/);
  assert.match(diff, /node --test/);
});

test('ci-auto-fixer patch safety blocks secrets and its own workflow', () => {
  assert.throws(
    () => validatePatchSafety('diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-x\n+y\n'),
    /unsafe path/
  );
  assert.throws(
    () => validatePatchSafety('diff --git a/.github/workflows/ci-auto-fix.yml b/.github/workflows/ci-auto-fix.yml\n--- a/.github/workflows/ci-auto-fix.yml\n+++ b/.github/workflows/ci-auto-fix.yml\n@@ -1 +1 @@\n-x\n+y\n'),
    /self-modification/
  );
});

test('ci-auto-fixer prompt includes repo, failing log, and strict output contract', () => {
  const messages = buildMiniMaxMessages({
    repo: 'ooovenenoso/chrome-extension-foundry',
    prNumber: 7,
    failingLog: 'npm test failed\nAssertionError: expected 1 got 2',
    packageJson: '{"scripts":{"test":"node --test tests/*.test.js"}}',
    changedFiles: ['tests/unit/example.test.js'],
  });

  const joined = messages.map((m) => m.content).join('\n');
  assert.match(joined, /ooovenenoso\/chrome-extension-foundry/);
  assert.match(joined, /PR #7/);
  assert.match(joined, /AssertionError/);
  assert.match(joined, /unified diff/i);
  assert.match(joined, /No markdown fences/i);
});

test('ci-auto-fixer truncates logs from the tail where failures usually are', () => {
  const log = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
  const truncated = truncateLog(log, 120);
  assert.ok(truncated.length <= 160);
  assert.doesNotMatch(truncated, /line 0\n/);
  assert.match(truncated, /line 199/);
});
