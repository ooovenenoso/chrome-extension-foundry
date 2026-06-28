import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manifest is MV3 with required fields', () => {
  const m = JSON.parse(readFileSync('src/redirect-chain-visualizer/manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.ok(m.name);
  assert.ok(m.version);
  assert.ok(Array.isArray(m.permissions));
});
