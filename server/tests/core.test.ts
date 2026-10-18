import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, publicIP, webUrl, safeFetch } from '../network.js';
import { platform, normalizeActor, youtubeId } from '../extract.js';
import { detectFile } from '../storage.js';
import { graphName, publicItem } from '../graph.js';
import { chunkText } from '../ai.js';
import { lexical } from '../retrieval.js';

test('SSRF guards reject loopback, mapped IPv4, LAN, link-local, multicast and credentials',async()=>{
  for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','fe80::1','0.0.0.0','224.0.0.1'])assert.equal(publicIP(ip),false,ip);
  assert.equal(publicIP('1.1.1.1'),true);
  for(const url of ['file:///x','http://localhost/a','http://user:pass@example.com','https://example.com:8080','javascript:alert(1)'])assert.throws(()=>webUrl(url));
  await assert.rejects(safeFetch('http://127.0.0.1'),/blocked/);
});
test('canonicalization removes only known tracking fields and retains semantic query parameters',()=>{
  assert.equal(canonical('https://example.com/a?utm_source=x&page=2&fbclid=a#section'),'https://example.com/a?page=2');
  assert.equal(canonical('https://example.com/a?id=1&ref=guide'),'https://example.com/a?id=1&ref=guide');
});
test('source boundaries and YouTube IDs do not accept lookalike hosts or arbitrary paths',()=>{
  assert.equal(platform('https://instagram.com.evil.example/reel/1'),'Website');
  assert.equal(platform('https://pin.it/abc'),'Pinterest');
  assert.equal(youtubeId('https://www.youtube.com/shorts/abcdefghijk'),'abcdefghijk');
  assert.throws(()=>youtubeId('https://youtube.com/channel/abc'));
});
test('Apify normalization keeps caption-only and incomplete X article coverage honest',()=>{
  const reel=normalizeActor({caption:'रंगोली dots tutorial',displayUrl:'https://example.com/a.png'},'Instagram');
  assert.match(reel.text,/रंगोली/);assert.equal(reel.coverage,'partial content');assert.equal(reel.images?.length,1);
  const preview=normalizeActor({text:'Article preview'},'X');assert.equal(preview.details?.articleBodyAvailable,false);
  assert.equal(normalizeActor({},'Pinterest').coverage,'metadata only');
});
test('Pinterest includes SEO metadata when the pin description is blank',()=>{
  const pin=normalizeActor({description:' ',grid_title:'',seo_title:'Fondant flowers for cakes',seo_description:'Cake decoration with roses',board:{name:'Unrelated board'},images:{orig:{url:'https://example.com/pin.jpg'}}},'Pinterest');
  assert.equal(pin.title,'Fondant flowers for cakes');
  assert.match(pin.text,/Cake decoration with roses/);
  assert.doesNotMatch(pin.text,/Unrelated board/);
  assert.deepEqual(pin.details?.metadataFields,['seo_title','seo_description']);
  assert.equal(pin.images?.length,1);
  assert.equal(pin.coverage,'partial content');
});
test('file validation relies on signature, not a supplied extension or MIME',()=>{
  assert.equal(detectFile(Buffer.from('%PDF-1.7\n')),'application/pdf');
  assert.equal(detectFile(Buffer.from([137,80,78,71,13,10,26,10])),'image/png');
  assert.throws(()=>detectFile(Buffer.from('<script>alert(1)</script>')));
});
test('graph names are deterministic opaque tenant identifiers',()=>{
  assert.equal(graphName('alice'),graphName('alice'));assert.notEqual(graphName('alice'),graphName('bob'));assert.doesNotMatch(graphName('alice'),/alice/);
});
test('public items never expose internal storage keys, leases or raw extraction payloads',()=>{
  const item=publicItem({id:'x',fileKey:'secret/object',lease:'secret',extraction:'private',content:'raw',topics:[]} as any);
  assert.equal(item.fileKey,'remote:x');assert.equal('lease' in item,false);assert.equal('extraction' in item,false);assert.equal('content' in item,false);
});
test('chunking retains page references and bounded overlap with multilingual content',()=>{
  const text='रंगोली patterns '.repeat(200);const chunks=chunkText([{text,location:'PDF page 4',derived:true}]);
  assert.ok(chunks.length>1);assert.match(chunks[1].location,/PDF page 4/);assert.equal(chunks[0].derived,true);assert.ok(chunks.every(c=>c.text.length<=1700));
  assert.equal(lexical('रंगोली tutorial','रंगोली'),1);
});
