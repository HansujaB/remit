import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Library, database, closeDatabase } from '../dist-server/graph.js';
import { processItem } from '../dist-server/worker.js';
import { retrieve, ask } from '../dist-server/retrieval.js';

// Uses a temporary graph and synthetic text; makes billable Groq requests.
const lib = Library.forUser(`smoke-${randomUUID()}`);
const db = await database();
try {
  await lib.init();
  await lib.topic('System design');
  const { item } = await lib.create({ title: 'Caching test', kind: 'note', content: 'Caching reduces latency by storing frequently requested data closer to users. A time-to-live of 60 seconds limits how long stale cache entries remain.', topics: [] });
  const job = await lib.claim();
  assert.ok(job);
  await processItem(lib, job.item, job.token);
  const saved = await lib.get(item.id);
  assert.equal(saved.status, 'complete', 'Synthetic save must complete processing');
  console.log('Groq classification + local embeddings + graph commit: PASS');
  console.log(`Assigned topics: ${saved.topics.length}`);
  const search = await retrieve(lib, { query: 'How can response latency be reduced?', semantic: true, graph: true });
  assert.ok(search.ids.includes(item.id));
  assert.equal(search.warnings.length, 0);
  console.log('Semantic retrieval: PASS');
  const answer = await ask(lib, { query: 'How long do stale cache entries remain?', semantic: true, graph: true });
  assert.equal(answer.insufficient, false);
  assert.ok(answer.sources.some(source => source.itemId === item.id));
  console.log('Groq answer with saved-source citations: PASS');
} catch (error) {
  console.error(`Pipeline: FAIL (${error?.name || 'Error'}${Number.isInteger(error?.status) ? `, HTTP ${error.status}` : ''})`);
  process.exitCode = 1;
} finally {
  await db.selectGraph(lib.name).delete();
  await closeDatabase();
}
