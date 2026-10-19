import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {parseModelResponse,providerRetryDelay} from '../model-response.js';
import {Library} from '../graph.js';

test('structured output preserves valid data and distinguishes truncation from schema errors',()=>{
  const schema=z.object({confidence:z.number()});
  assert.deepEqual(parseModelResponse(schema,'{"confidence":0.7}','stop','test'),{confidence:0.7});
  assert.throws(()=>parseModelResponse(schema,'{"confidence":','length','test'),/cut short/);
  assert.throws(()=>parseModelResponse(schema,'{"confidence":"high"}','stop','test'),/unexpected response format/);
  assert.throws(()=>parseModelResponse(schema,'not JSON','stop','test'),/incomplete JSON/);
});
test('rate limits honor Retry-After with at least a minute cooldown',()=>{
  const now=Date.parse('2026-01-01T00:00:00Z');
  assert.equal(providerRetryDelay('120',now),120000);
  assert.equal(providerRetryDelay('Thu, 01 Jan 2026 00:02:00 GMT',now),120000);
  for (const value of [null,'invalid','0','-1']) assert.equal(providerRetryDelay(value,now),60000);
});
test('worker retry scheduling does not retry ahead of provider cooldown',async()=>{
  const lib=Library.forUser('retry-test');let parameters:any;
  lib.q=async(_q,p)=>{parameters=p;return [];};
  const before=Date.now();
  await lib.fail({id:'example',generation:1,attempts:1} as any,'lease','Rate limited',false,120000);
  assert.equal(parameters.status,'queued');
  assert.ok(parameters.next>=before+120000);
});
