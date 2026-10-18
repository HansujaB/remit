import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';

test('HTTP rejects disallowed origins, unauthenticated access, and malformed JSON before touching graph',async()=>{
  const app=createApp((_req,res,next)=>next());const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address() as any;const url=`http://127.0.0.1:${address.port}/api/library`;
  try {
    assert.equal((await fetch(url,{headers:{Origin:'https://untrusted.example'}})).status,403);
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})).status,400);
  }finally {await new Promise<void>(r=>server.close(()=>r()));}
});
