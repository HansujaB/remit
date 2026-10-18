import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWebResource, readerResult } from '../reader.js';
import { SourceHttpError } from '../network.js';
import { HttpError } from '../config.js';
const extraction=readerResult({code:200,data:{title:'An article',content:'Useful public article text.'}},'https://example.com/article');

test('direct 403 reaches reader using the validated final URL',async()=>{
 let requested='';
 const result=await fetchWebResource('https://example.com/share',{
  primary:async()=>{throw new SourceHttpError(403,'https://example.com/article');},
  reader:async(url)=>{requested=url;return extraction;},enabled:true,
 });
 assert.equal(result.kind,'reader');assert.equal(requested,'https://example.com/article');
});
test('reader never bypasses private-network validation, size limits, or missing pages',async()=>{
 for(const error of [new HttpError(400,'Private destination'),new HttpError(413,'Too large'),new SourceHttpError(404,'https://example.com')]) {
  await assert.rejects(fetchWebResource('https://example.com',{primary:async()=>{throw error;},reader:async()=>{assert.fail('Reader must not run');},enabled:true}));
 }
});
test('reader disabled preserves direct error, and a reader error is not hidden',async()=>{
 const primary=async()=>{throw new SourceHttpError(403,'https://example.com');};
 await assert.rejects(fetchWebResource('https://example.com',{primary,reader:async()=>extraction,enabled:false}),/Source returned HTTP 403/);
 await assert.rejects(fetchWebResource('https://example.com',{primary,reader:async()=>{throw new HttpError(422,'Article reader returned HTTP 401');},enabled:true}),/reader returned HTTP 401/);
});
test('reader normalizes accessible text and rejects challenge/error responses',()=>{
 assert.equal(extraction.adapter,'jina-reader');assert.equal(extraction.coverage,'partial content');
 assert.throws(()=>readerResult({code:200,data:{title:'Just a moment...',content:'Challenge'}},'https://example.com'),/blocked/);
 assert.throws(()=>readerResult({code:403},'https://example.com'),/could not access/);
});
