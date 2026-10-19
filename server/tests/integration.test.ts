import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Library, database, closeDatabase } from '../graph.js';
import { config } from '../config.js';
import { retrieve } from '../retrieval.js';
import { createApp } from '../app.js';
import { exploreLibrary } from '../ask-agent.js';

test('real FalkorDB: isolation, concurrent dedupe, leases, evidence, hierarchy, merges and API ownership',{skip:process.env.RUN_DB_TESTS!=='1',timeout:60000},async()=>{
  const prefix='test_'+randomUUID(),a=Library.forUser(prefix+'a'),b=Library.forUser(prefix+'b');
  const db=await database();let server:any;
  try {
    await a.init();await b.init();
    const saves=await Promise.all(Array.from({length:4},()=>a.create({url:'https://example.com/a',canonicalUrl:'https://example.com/a',title:'Caching guide',platform:'Website',kind:'link',topics:['System design']})));
    assert.equal(new Set(saves.map(s=>s.item.id)).size,1);const id=saves[0].item.id;
    assert.equal((await b.list()).items.length,0);await assert.rejects(b.get(id));
    const claims=await Promise.all([a.claim(),a.claim()]);assert.equal(claims.filter(Boolean).length,1);const job=claims.find(Boolean)!;
    await a.patch(id,{topics:['Manual topic']});
    const c1={id:randomUUID(),text:'Caching reduces latency but may return stale data.',location:'PDF page 1',derived:false,concepts:['caching'],embedding:Array.from({length:config.EMBEDDING_DIMENSIONS},(_,i)=>i===0?1:0)};
    await a.commit(id,job.token,job.item.generation,[c1],[{name:'Automatic',quote:'Caching',reason:'Matches',confidence:0.9}],{description:'Caching guide',coverage:'partial content'});
    assert.deepEqual((await a.get(id)).topics,['Manual topic']);
    const second=await a.create({title:'Cache example',content:'This example uses caching.',kind:'note',topics:['Manual topic']});const next=await a.claim();assert.ok(next);
    await a.commit(second.item.id,next.token,next.item.generation,[{...c1,id:randomUUID(),text:'An example of caching with a short TTL.'}],[],{coverage:'full supported extraction'});
    const results=await retrieve(a,{query:'stale',semantic:false,graph:true});assert.ok(results.paths.some(p=>p.to===second.item.id));
    let turn=0;
    const agent=await exploreLibrary(a,{query:'Find study material',semantic:false},retrieve,async()=>({
      intent:'discover',tool:turn++===0?'explore_topics':turn===2?'find_connected_saves':'finish',
      topics:['Manual topic'],query:'',clarification:'Which subject are you studying?'}),async()=>({matches:[{id,reason:'Caching',confidence:0.9},{id:second.item.id,reason:'Caching',confidence:0.9}],clarification:''}));
    assert.equal(agent.matches.length,2);assert.ok(agent.paths.length>0);
    assert.ok(agent.trace.some(t=>t.tool==='find_connected_saves'));
    await a.topic('Parent');await a.topic('Manual topic',[],'Parent');
    assert.equal((await retrieve(a,{query:'',topic:'Parent'})).ids.length,2);await assert.rejects(a.topic('Parent',[],'Manual topic'),/cycle/);
    await a.topic('Target');const merge=await a.mergeTopic('Manual topic','Target');assert.ok((await a.get(id)).topics.includes('Target'));await a.undoMerge(merge);assert.ok((await a.get(id)).topics.includes('Manual topic'));
    await a.preference('Keep Rangoli separate','library');assert.equal((await new Library(a.name).preferences()).length,1);
    await a.retry(id);const stale=await a.claim();assert.ok(stale);await a.retry(id);assert.equal(await a.commit(id,stale.token,stale.item.generation,[c1],[],{}),false);
    const app=createApp((_req,res,next)=>{res.locals.userId=prefix+'b';next();});server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/items/${id}`);assert.equal(response.status,404);
    await a.markDelete(id);await a.finishDelete(id);assert.equal((await a.q('MATCH (c:Concept {key:$key}) RETURN count(c) AS n',{key:'caching'}))[0].n,1);
  }finally {if(server)await new Promise<void>(r=>server.close(()=>r()));await db.selectGraph(a.name).delete();await db.selectGraph(b.name).delete();await closeDatabase();}
});
