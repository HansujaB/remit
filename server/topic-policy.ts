import type { Assignment } from './types.js';
import { sourceQuote } from './source-quote.js';

export const TAGGING_VERSION = 'subjects-v2';
// Explicit subject aliases provide a local fallback, not inferred video contents.
const subjects: [string, RegExp][] = [
  ['System design', /\bsystem\s+design\b/i],
  ['HLD', /\bHLD\b|\bhigh[ -]level\s+design\b/i],
  ['Motion Design', /\bmotion\s+(?:design(?:ers?)?|graphics)\b/i],
  ['AI Video Generation', /\bAI[ -](?:generated\s+)?videos?\b/i],
  ['Java', /\bJava\b(?!Script)/i],
  ['Exception Handling', /\bexception\s+handling\b/i],
  ['Machine Learning', /\bmachine\s+learning\b/i],
  ['Rangoli', /\brangoli\b|रंगोली/iu],
];

const engagementTag = /\b(?:hire\s*(?:vs\.?|or|versus|\/|-)\s*reject|verdict|follow\s*ups?|comment|subscribe|giveaway|call.to.action|engagement\s*bait)\b/i;

export function subjectAssignments(text: string, proposed: Assignment[] = []): Assignment[] {
  const explicit = subjects.flatMap(([name, pattern]) => {
    const quote = text.match(pattern)?.[0];
    return quote ? [{name, quote, confidence: 1, reason: 'Subject explicitly named in the saved text.'}] : [];
  });
  const accepted: Assignment[] = [];
  for (const a of [...explicit, ...proposed]) {
    const name = a.name.trim();
    const quote = sourceQuote(text, a.quote);
    if (!name || name.length > 60 || engagementTag.test(name) || !quote) continue;
    if (accepted.some(t => t.name.toLowerCase() === name.toLowerCase())) continue;
    accepted.push({...a, name, quote});
    if (accepted.length === 2) break;
  }
  return accepted;
}
