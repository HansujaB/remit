// Character budgets apply before serialization/provider calls, not after retrieval.
export const ASK_EVIDENCE_CHARS = 6000;
export function compactEvidence(rows: any[], query: string) {
  let remaining = ASK_EVIDENCE_CHARS;
  const counts = new Map<string, number>();
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  return rows.flatMap(row => {
    if (remaining <= 0 || (counts.get(row.itemId) || 0) >= 2) return [];
    const raw = String(row.text || '');
    const positions = tokens.map(t => raw.toLowerCase().indexOf(t)).filter(p => p >= 0);
    const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 120);
    const text = raw.slice(start, start + Math.min(750, remaining));
    if (!text.trim()) return [];
    remaining -= text.length;
    counts.set(row.itemId, (counts.get(row.itemId) || 0) + 1);
    return [{ id: String(row.id).slice(0, 100), itemId: row.itemId,
      title: String(row.title || '').slice(0, 160), text,
      location: String(row.location || '').slice(0, 120), derived: !!row.derived }];
  }).slice(0, 8);
}
