import { sourceQuote } from './source-quote.js';

export function supportedTitle(text: string, proposal?: {title:string;quote:string;confidence:number} | null) {
  if (!proposal || proposal.confidence < 0.7 || proposal.confidence > 1) return '';
  const title = proposal.title.replace(/\s+/g, ' ').trim();
  if (!title || title.length > 100 || !sourceQuote(text, proposal.quote)) return '';
  return title;
}

export function processedTitle(item: {manualTitle?:boolean;platform:string}, extracted: string, generated: string) {
  if (item.manualTitle) return '';
  return (item.platform === 'Instagram' ? generated || extracted : extracted).trim().slice(0,250);
}
