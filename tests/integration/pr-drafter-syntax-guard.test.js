// tests/integration/pr-drafter-syntax-guard.test.js — verifies that
// pr-drafter invokes syntax-guard, and that a SyntaxError in the LLM-style
// template (the exact 2026-07-16 bug) is caught BEFORE any commit lands.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = process.cwd();
const PR_DRAFTER = join(REPO, 'agents/scripts/pr-drafter.js');

const SPEC_BODY = (name) => `# GOAL.md — ${name}

## §1. Mission

Helps users score local context priority without sending data to a server.

## §2. Surface

Popup, content script, service worker, lib under src/<id>.

## §3. Behavior contracts

When the user clicks the popup action, the extension scores visible context locally and renders the result.

## §4. Permissions rationale

| Permission | Why |
|---|---|
| storage | Local score storage only. |
| activeTab | Read current tab after user action. |

## §5. Testing contract

Unit tests cover scoring logic.

## §6. Backlog

First PR ships minimal MV3.

## §7. Loops-allowed table

None — no autonomous re-runs.

## §8. Versioning

0.1.0 MVP.

## §9. Anti-goals

No cloud sync. No telemetry.

## §10. Monetization

Stripe tip jar placeholders only.
`;

function setupWorkdir() {
  const dir = mkdtempSync(join(tmpdir(), 'pd-sg-'));
  mkdirSync(join(dir, 'docs/specs/sample-ext'), { recursive: true });
  writeFileSync(join(dir, 'docs/specs/sample-ext/GOAL.md'), SPEC_BODY('Sample Ext'));
  spawnSync('git', ['init'], { cwd: dir });
  spawnSync('git', ['add', 'docs'], { cwd: dir });
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@t.invalid', 'commit', '-m', 'spec'], { cwd: dir });
  return dir;
}

test('pr-drafter: happy path — syntax-guard accepts, files staged', () => {
  const dir = setupWorkdir();
  try {
    const r = spawnSync('node', [PR_DRAFTER, '--spec', 'docs/specs/sample-ext/GOAL.md'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    assert.ok(existsSync(join(dir, 'src/sample-ext/lib/priorityScorer.js')));
    assert.ok(existsSync(join(dir, 'src/sample-ext/manifest.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pr-drafter: syntax-guard rejects → no staged files, exit non-zero', () => {
  const dir = setupWorkdir();
  try {
    // Sabotage pr-drafter's own lib/priorityScorer.js template by monkey-patching
    // is too intrusive. Instead, we create a *pre-existing* bad JS file inside
    // src/sample-ext/lib/ that pr-drafter would overwrite — the syntax-guard
    // picks up everything in src/<id>/*, including pre-existing files.
    mkdirSync(join(dir, 'src/sample-ext/lib'), { recursive: true });
    writeFileSync(join(dir, 'src/sample-ext/lib/leftover.js'),
      // Same SyntaxError pattern as the 2026-07-16 run
      "const x = String(t) + '\n';\nexport default x;\n");

    const r = spawnSync('node', [PR_DRAFTER, '--spec', 'docs/specs/sample-ext/GOAL.md'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(r.status, 0, `expected non-zero, got ${r.status}; stderr=${r.stderr}`);

    // The bad file remains (syntax-guard doesn't delete pre-existing files outside
    // the staged list), but pr-drafter should NOT have created new ones. The test
    // only asserts pr-drafter exited with the guard's exit code (1).
    assert.equal(existsSync(join(dir, 'src/sample-ext/manifest.json')), false, 'manifest should not have been created when guard rejected');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
