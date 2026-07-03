import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreEmailThread,
  summarizePriority,
  extractSignalsFromText,
} from '../../src/email-thread-priority-scorer/lib/priorityScorer.js';

test('scoreEmailThread ranks urgent deal email as high priority', () => {
  const result = scoreEmailThread({
    subject: 'URGENT: contract renewal approval needed today',
    sender: 'vp-sales@customer.example',
    body: 'The customer is blocked. Please review the contract, pricing, and renewal terms before EOD today.',
  });

  assert.equal(result.level, 'high');
  assert.ok(result.score >= 80);
  assert.ok(result.reasons.some((reason) => reason.includes('urgency')));
  assert.ok(result.reasons.some((reason) => reason.includes('deal')));
});

test('scoreEmailThread keeps newsletters low priority', () => {
  const result = scoreEmailThread({
    subject: 'Weekly product newsletter',
    sender: 'news@example.invalid',
    body: 'Here are this week’s blog posts and community updates. Unsubscribe any time.',
  });

  assert.equal(result.level, 'low');
  assert.ok(result.score < 45);
  assert.ok(result.reasons.some((reason) => reason.includes('newsletter')));
});

test('extractSignalsFromText pulls subject, sender, and body from visible Gmail-like text', () => {
  const signals = extractSignalsFromText('Subject: Pricing blocked today\nFrom: ceo@lead.example\nNeed approval on proposal before close of business.');

  assert.equal(signals.subject, 'Pricing blocked today');
  assert.equal(signals.sender, 'ceo@lead.example');
  assert.match(signals.body, /approval on proposal/);
});

test('summarizePriority returns a human-readable one-line summary', () => {
  const summary = summarizePriority({ score: 88, level: 'high', reasons: ['urgency terms found', 'deal terms found'] });

  assert.match(summary, /High priority/i);
  assert.match(summary, /88/);
  assert.match(summary, /urgency/);
});
