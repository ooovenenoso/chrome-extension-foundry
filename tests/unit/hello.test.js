import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hello } from '../../src/postgres-explain-visualizer/lib/hello.js';

test('hello returns greeting', () => {
  assert.equal(hello('World'), 'Hello, World!');
});
