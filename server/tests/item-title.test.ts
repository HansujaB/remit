import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedTitle, processedTitle } from '../item-title.js';
import { normalizeActor } from '../extract.js';

test('Instagram captions remain evidence but profile names are not post titles',()=>{
  const result=normalizeActor({name:'creator123',caption:'Learn database indexing with B-trees.'},'Instagram');
  assert.equal(result.title,'');
  assert.match(result.text,/database indexing/);
});
test('generated titles require source evidence and 70 percent confidence',()=>{
  const text='Learn database indexing with B-trees.';
  const proposal={title:'Database indexing with B-trees',quote:'database indexing with B-trees',confidence:0.7};
  assert.equal(supportedTitle(text,proposal),proposal.title);
  assert.equal(supportedTitle(text,{...proposal,confidence:0.69}),'');
  assert.equal(supportedTitle(text,{...proposal,quote:'quantum computing'}),'');
  assert.equal(supportedTitle(text,null),'');
});
test('Instagram gets the descriptive title while manual titles and other sources are preserved',()=>{
  assert.equal(processedTitle({platform:'Instagram'},'', 'Database indexing'),'Database indexing');
  assert.equal(processedTitle({platform:'Instagram',manualTitle:true},'Source','Generated'),'');
  assert.equal(processedTitle({platform:'Website'},'Article title','Generated'),'Article title');
});
