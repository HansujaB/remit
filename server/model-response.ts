import {z} from 'zod';
import {HttpError} from './config.js';

export function parseModelResponse<T extends z.ZodType>(schema:T, content:string, finishReason:string, name:string):z.infer<T> {
  if (finishReason === 'length') throw new HttpError(422, 'Text processing output was cut short. Processing will retry automatically.');
  let decoded:unknown;
  try { decoded=JSON.parse(content); }
  catch {
    console.error(JSON.stringify({event:'model_validation_failed',operation:name,reason:'invalid_json',finishReason,characters:content.length}));
    throw new HttpError(422,'Text processing returned incomplete JSON. Processing will retry automatically.');
  }
  const parsed=schema.safeParse(decoded);
  if (!parsed.success) {
    console.error(JSON.stringify({event:'model_validation_failed',operation:name,reason:'schema',issues:parsed.error.issues.map(i=>({path:i.path,code:i.code})).slice(0,8)}));
    throw new HttpError(422,'Text processing returned an unexpected response format. Processing will retry automatically.');
  }
  return parsed.data;
}

export function providerRetryDelay(header:string|null, now=Date.now()) {
  const seconds=header ? Number(header) : NaN;
  const parsed=Number.isFinite(seconds) ? seconds*1000 : header ? Date.parse(header)-now : 0;
  return Math.min(86400000,Math.max(60000,Number.isFinite(parsed)?parsed:0));
}
