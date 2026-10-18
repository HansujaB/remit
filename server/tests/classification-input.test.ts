import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationText, classificationContext } from '../classification-input.js';

test('classification samples long documents across their length with a fixed budget', () => {
  const input = 'A'.repeat(12000) + 'B'.repeat(12000) + 'C'.repeat(12000);
  const result = classificationText(input);
  assert.ok(result.length <= 8006);
  assert.ok(result.startsWith('A'));
  assert.ok(result.includes('B'));
  assert.ok(result.endsWith('C'));
  assert.equal(classificationText('short document'), 'short document');
});

test('classification context is bounded and preserves preference priority', () => {
  const result = classificationContext({preferences:[{text:'Keep Java separate'}],topics:Array.from({length:100},(_,i)=>({name:`Topic ${i}`,description:'x'.repeat(200)}))});
  assert.deepEqual(result.preferences, [{text:'Keep Java separate'}]);
  assert.ok(result.topics.length < 100);
  assert.ok(JSON.stringify(result).length < 4200);
});
