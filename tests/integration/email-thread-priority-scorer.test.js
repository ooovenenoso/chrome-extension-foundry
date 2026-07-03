import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const EXT_DIR = 'src/email-thread-priority-scorer';

test('extension manifest is MV3 with Gmail content script and minimal permissions', () => {
  const manifest = JSON.parse(readFileSync(`${EXT_DIR}/manifest.json`, 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Email Thread Priority Scorer');
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'storage'].sort());
  assert.deepEqual(manifest.host_permissions, ['https://mail.google.com/*']);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.background.service_worker, 'service-worker.js');
  assert.equal(manifest.content_scripts[0].matches[0], 'https://mail.google.com/*');
});

test('popup wires scoring action, demo fallback, and placeholder Stripe links', () => {
  const html = readFileSync(`${EXT_DIR}/popup.html`, 'utf8');
  const js = readFileSync(`${EXT_DIR}/popup.js`, 'utf8');
  const stripe = readFileSync(`${EXT_DIR}/STRIPE_LINKS.md`, 'utf8');

  assert.match(html, /id="scoreCurrentThread"/);
  assert.match(html, /id="runDemo"/);
  assert.match(html, /id="tip3"/);
  assert.match(js, /chrome\.tabs\.sendMessage/);
  assert.match(js, /scoreEmailThread/);
  assert.match(stripe, /test_replace_tip3/);
});

test('package script creates a zip that contains extension files and excludes tests', () => {
  rmSync('dist/email-thread-priority-scorer-v0.1.0.zip', { force: true });
  const result = spawnSync('python3', ['scripts/package-extension.py', 'email-thread-priority-scorer'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(existsSync('dist/email-thread-priority-scorer-v0.1.0.zip'));
  assert.match(result.stdout, /manifest\.json/);
  assert.doesNotMatch(result.stdout, /tests\//);
});
