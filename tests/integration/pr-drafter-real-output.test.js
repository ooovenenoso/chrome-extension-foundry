import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = process.cwd();
const PR_DRAFTER = join(REPO, 'agents/scripts/pr-drafter.js');

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8' });
}

function makeSpecBody(name = 'Sample CRM Signal Helper') {
  return `# GOAL.md — ${name}

## §1. Mission

Helps sales operators prioritize the current browser page by scoring urgency, deal, sender, and follow-up signals locally.

## §2. Surface

Popup, content script, service worker, and pure scoring lib under src/sample-crm-signal-helper.

## §3. Behavior contracts

Given a user clicks the popup action, when the active tab has page text, then the extension scores visible context locally and renders a priority summary.

## §4. Permissions rationale

| Permission | Why |
|---|---|
| storage | Store latest local score only. |
| activeTab | Read current tab after user action. |

## §5. Testing contract

Node unit tests cover scoring logic. Integration tests cover manifest and package shape.

## §6. Backlog

First PR ships minimal MV3.

## §7. Loops-allowed table

Read-only auditors may inspect generated files.

## §8. Versioning

0.1.0 MVP.

## §9. Anti-goals

No cloud sync. No telemetry. No live payment integration.

## §10. Monetization

Stripe tip jar placeholders only.
`;
}

test('pr-drafter generates a loadable real MV3 scaffold instead of placeholder hello/TODO files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr-drafter-real-'));
  const specDir = join(dir, 'docs/specs/sample-crm-signal-helper');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'GOAL.md'), makeSpecBody());

  assert.equal(run('git', ['init'], dir).status, 0);
  assert.equal(run('git', ['add', 'docs'], dir).status, 0);
  assert.equal(run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'spec'], dir).status, 0);

  const result = run('node', [PR_DRAFTER, '--spec', 'docs/specs/sample-crm-signal-helper/GOAL.md'], dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const extDir = join(dir, 'src/sample-crm-signal-helper');
  const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
  const popup = readFileSync(join(extDir, 'popup.js'), 'utf8');
  const content = readFileSync(join(extDir, 'contentScript.js'), 'utf8');
  const unitTest = readFileSync(join(dir, 'tests/unit/sample-crm-signal-helper-priority.test.js'), 'utf8');

  assert.equal(manifest.manifest_version, 3);
  assert.notEqual(manifest.content_scripts[0].matches[0], '<TODO>');
  assert.ok(manifest.action.default_popup);
  for (const icon of Object.values(manifest.icons)) {
    assert.ok(existsSync(join(extDir, icon)), `missing icon ${icon}`);
  }

  assert.ok(existsSync(join(extDir, 'STRIPE_LINKS.md')), 'Stripe links should live inside the extension directory');
  assert.equal(existsSync(join(dir, 'STRIPE_LINKS.md')), false, 'root STRIPE_LINKS.md should not be generated');
  assert.ok(existsSync(join(extDir, 'lib/priorityScorer.js')));
  assert.equal(existsSync(join(extDir, 'lib/hello.js')), false, 'hello placeholder should not be generated');
  assert.match(popup, /scoreCurrentTab|scoreCurrentPage/);
  assert.match(popup, /runDemo/);
  assert.match(content, /onMessage\.addListener/);
  assert.match(content, /CAPTURE_PAGE_CONTEXT/);
  assert.match(unitTest, /scorePageContext/);
});
