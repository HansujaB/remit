import { HttpError, required } from './config.js';
import { safeFetch, SourceHttpError, validatePublic } from './network.js';
import type { Extraction } from './types.js';

export function readerResult(body: any, url: string, fallbackTitle = ''): Extraction {
  const data = body?.data;
  if (body?.code !== 200 || typeof data?.content !== 'string' || !data.content.trim())
    throw new HttpError(422, 'The reader could not access article text. The bookmark is saved.');
  const title = typeof data.title === 'string' ? data.title.trim() : fallbackTitle;
  if (/^(just a moment|access denied|403 forbidden|sign in|checking your browser)[.!…\s]*$/i.test(title) ||
      /Warning: Target URL returned error (?:401|403|429|5\d\d)/i.test(data.content))
    throw new HttpError(422, 'This article is still blocked by its publisher. The bookmark is saved.');
  return { title: title || fallbackTitle || new URL(url).hostname, text: data.content.slice(0,150000),
    coverage: 'partial content', adapter: 'jina-reader',
    details: {resolvedUrl:url, modalities:['article text'], readerFallback:true} };
}

export async function readWithJina(url: string, title = ''): Promise<Extraction> {
  await validatePublic(url);
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: {Authorization:`Bearer ${required('JINA_API_KEY')}`, Accept:'application/json', 'X-Respond-With':'markdown'},
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 422,
    `Article reader returned HTTP ${response.status}. The bookmark is saved.`);
  if (!response.body) throw new HttpError(422, 'Article reader returned no content.');
  const reader=response.body.getReader(); const parts:Uint8Array[]=[]; let size=0;
  try { while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.length;
    if(size>2*1024*1024){await reader.cancel();throw new HttpError(413,'Article reader response exceeds the size limit.');} parts.push(value);
  }} finally {reader.releaseLock();}
  let body; try {body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new HttpError(422,'Article reader returned an unreadable response.');}
  return readerResult(body,url,title);
}

export async function fetchWebResource(url: string, dependencies = {
  primary: safeFetch, reader: readWithJina, enabled: !!process.env.JINA_API_KEY?.trim(),
}) {
  try { return {kind:'direct' as const, resource:await dependencies.primary(url,20*1024*1024)}; }
  catch(error) {
    // Do not route private-network, file-size or unsupported-format failures through a proxy.
    if (!(error instanceof SourceHttpError) || !dependencies.enabled || ![401,403,429,500,502,503,504].includes(error.sourceStatus)) throw error;
    return {kind:'reader' as const, extraction:await dependencies.reader(error.sourceUrl)};
  }
}
