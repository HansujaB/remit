import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Library, database, closeDatabase } from '../dist-server/graph.js';
import { ask } from '../dist-server/retrieval.js';
// Synthetic-only live test: no personal library or uploaded document is read.
const lib = Library.forUser('ask-smoke-' + randomUUID());
const db = await database();
try {
  await lib.init();
  for (const [title, topic, concept] of [
    ['HLD interview discussion', 'HLD', 'system design'],
    ['DBMS interview revision', 'DBMS', 'databases'],
    ['Machine learning revision', 'Machine Learning', 'machine learning'],
    ['Rangoli patterns', 'Rangoli', 'rangoli'],
    ['AI video generation prompts', 'AI Video Generation', 'machine learning'],
  ]) {
    const {item} = await lib.create({title,content:title,kind:'note',topics:[topic]});
    const job = await lib.claim();
    assert.ok(job);
    await lib.commit(item.id,job.token,job.item.generation,[{id:randomUUID(),text:title,location:'Synthetic fixture',derived:false,concepts:[concept]}],[],{coverage:'full supported extraction'});
  }
  const result = await ask(lib,{query:'Did I save something related to interview prep?',semantic:false});
  assert.equal(result.insufficient,false);
  assert.ok(!result.trace.some(t=>t.tool==='read_evidence'), 'discovery should not send passages to Groq');
  assert.ok(result.matches.some(m=>m.topics.includes('HLD')));
  assert.ok(result.matches.some(m=>m.topics.includes('DBMS')));
  assert.ok(!result.matches.some(m=>m.topics.includes('Rangoli')));
  assert.ok(!result.matches.some(m=>m.topics.includes('AI Video Generation')));
  assert.ok(!result.matches.some(m=>m.topics.includes('Machine Learning')));
  console.log(JSON.stringify({answer:result.answer,clarification:result.clarification,topics:result.selectedTopics,trace:result.trace}));
} finally {
  await db.selectGraph(lib.name).delete();
  await closeDatabase();
}

