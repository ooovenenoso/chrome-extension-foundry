#!/usr/bin/env node
// lint-contracts.js — lightweight repo lint for generated contracts and extension manifests.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

const jsonFiles = [
  'package.json',
  'agents/contracts/idea-pool.schema.json',
  'agents/contracts/research-snapshot.schema.json',
  'agents/contracts/scoring-rubric.v1.json',
];

async function parseJson(path) {
  JSON.parse(await readFile(path, 'utf8'));
}

async function lintExtensionManifest(extId) {
  const manifestPath = `src/${extId}/manifest.json`;
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const errors = [];
  if (manifest.manifest_version !== 3) errors.push(`${manifestPath}: manifest_version must be 3`);
  if (!manifest.name) errors.push(`${manifestPath}: name is required`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) errors.push(`${manifestPath}: version must be semver-ish`);
  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    if (!existsSync(`src/${extId}/${iconPath}`)) errors.push(`${manifestPath}: missing icon ${size} at ${iconPath}`);
  }
  return errors;
}

async function main() {
  const errors = [];
  for (const path of jsonFiles) {
    try {
      await parseJson(path);
      console.log(`✅ ${path} parses`);
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }

  const specsDir = 'docs/specs';
  for (const entry of await readdir(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    errors.push(...await lintExtensionManifest(entry.name));
  }

  if (errors.length) {
    for (const error of errors) console.error(`❌ ${error}`);
    exit(1);
  }
  console.log('\nLint passed.');
}

main().catch((error) => { console.error(error); exit(2); });
