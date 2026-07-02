import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hello } from '../../src/email-thread-priority-scorer/lib/hello.js';

test('hello returns greeting', () => {
  assert.equal(hello('World'), 'Hello, World!');
});
