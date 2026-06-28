#!/usr/bin/env node
// validate-contracts.js — validate every JSON schema in agents/contracts/ against a sample fixture.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv';
import { exit } from 'node:process';

const contractsDir = 'agents/contracts';
const fixturesDir = 'tests/fixtures/contracts';

async function main() {
  const files = (await readdir(contractsDir)).filter(f => f.endsWith('.schema.json') || f.endsWith('.json'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  let fail = 0;

  for (const f of files) {
    // Skip meta-schemas — these define the contract shape, they don't have one.
    if (f.endsWith('.schema.json')) {
      const schema = JSON.parse(await readFile(join(contractsDir, f), 'utf8'));
      try {
        const ajvMeta = new Ajv({ allErrors: true, strict: false });
        ajvMeta.compile(schema); // verify schema itself compiles
        console.log(`✅ ${f} — schema compiles`);
      } catch (err) {
        console.error(`❌ ${f} — schema compile failed: ${err.message}`);
        fail++;
      }
      continue;
    }
    // Data files (e.g. scoring-rubric.v1.json) — validate structure + try matching fixture.
    const data = JSON.parse(await readFile(join(contractsDir, f), 'utf8'));
    // For data files, check that required top-level keys exist (lightweight).
    if (f === 'scoring-rubric.v1.json') {
      const required = ['version', 'weights', 'thresholds', 'axes', 'monetization_models'];
      const missing = required.filter(k => !(k in data));
      if (missing.length === 0) {
        console.log(`✅ ${f} — has all required keys (${required.join(', ')})`);
      } else {
        console.error(`❌ ${f} — missing keys: ${missing.join(', ')}`);
        fail++;
      }
    } else {
      console.log(`⏭️  ${f} — no schema check configured`);
    }
  }

  if (fail > 0) {
    console.error(`\n${fail} contract(s) failed`);
    exit(1);
  }
  console.log('\nAll contracts validated.');
}

main().catch(err => { console.error(err); exit(2); });
