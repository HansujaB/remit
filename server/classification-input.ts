// Sample across the document rather than uploading all extracted text for tagging.
export function classificationText(text: string, maxChars = 8000) {
  if (text.length <= maxChars) return text;
  const size = Math.floor(maxChars / 4);
  return Array.from({ length: 4 }, (_, i) => {
    const start = Math.floor((text.length - size) * i / 3);
    return text.slice(start, start + size);
  }).join('\n\n');
}

export function classificationContext(context: unknown) {
  const source = context && typeof context === 'object' ? context as Record<string, unknown> : {};
  const result: Record<string, unknown[]> = {};
  let remaining = 4000;
  for (const key of ['preferences', 'topics', 'relatedSaves']) {
    result[key] = [];
    const rows = Array.isArray(source[key]) ? source[key] as unknown[] : [];
    for (const row of rows) {
      const length = JSON.stringify(row).length;
      if (length > remaining) continue;
      result[key].push(row);
      remaining -= length;
    }
  }
  return result;
}
