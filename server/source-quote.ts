// Match only literal words, allowing OCR whitespace and capitalization differences.
// Return the actual source substring so stored evidence stays faithful to the source.
export function sourceQuote(text: string, quote: string): string | null {
  if (quote.trim().length < 3) return null;
  if (text.includes(quote)) return quote;
  const pattern = quote.trim().split(/\s+/u).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return text.match(new RegExp(pattern, 'iu'))?.[0] || null;
}
