import test from 'node:test';
import assert from 'node:assert/strict';
import { apifyTarget } from '../apify.js';

test('Apify routes Actor names and saved tasks to their respective endpoints', () => {
  assert.equal(apifyTarget('PINTEREST', {APIFY_PINTEREST_ACTOR_ID:'epctex/pinterest-scraper'}).path, 'acts/epctex~pinterest-scraper');
  assert.equal(apifyTarget('X', {APIFY_X_TASK_ID:'savedTask123'}).path, 'actor-tasks/savedTask123');
  assert.equal(apifyTarget('X', {APIFY_X_TASK_ID:'oldTask', APIFY_X_ACTOR_ID:'apidojo/tweet-scraper'}).kind, 'Actor');
  assert.throws(() => apifyTarget('X', {}), /Configure APIFY_X_ACTOR_ID/);
});
