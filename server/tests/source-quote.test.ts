import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceQuote } from '../source-quote.js';
test('topic evidence tolerates case and OCR whitespace while retaining source text', () => {
  assert.equal(sourceQuote('SYSTEM DESIGN - OCT 2026', 'System design'), 'SYSTEM DESIGN');
  assert.equal(sourceQuote('HLD\n  discussion', 'HLD discussion'), 'HLD\n  discussion');
  assert.equal(sourceQuote('System design', 'distributed databases'), null);
  assert.equal(sourceQuote('A [design] example', '[design]'), '[design]');
  assert.equal(sourceQuote('random content', '.*'), null);
});
