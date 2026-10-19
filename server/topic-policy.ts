import type { Assignment } from './types.js';
import { sourceQuote } from './source-quote.js';

export const TAGGING_VERSION = 'evidence-v3';
export const MIN_TOPIC_CONFIDENCE = 0.7;

export function subjectAssignments(text: string, proposed: Assignment[] = []): Assignment[] {
  const accepted: Assignment[] = [];
  for (const a of proposed) {
    const name = a.name.trim();
    const quote = sourceQuote(text, a.quote);
    if (!name || name.length > 60 || a.confidence < MIN_TOPIC_CONFIDENCE || a.confidence > 1 || !quote) continue;
    if (accepted.some(t => t.name.toLowerCase() === name.toLowerCase())) continue;
    accepted.push({...a, name, quote});
    if (accepted.length === 2) break;
  }
  return accepted;
}
