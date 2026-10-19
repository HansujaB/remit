// Remove standalone website controls, never matching phrases inside article prose.
const navigationLabel = /^(?:sitemap|open in app|sign up|sign in|log in|log out|subscribe|write|search|home|follow)$/i;
export function cleanReaderText(text) {
  return text.split(/\r?\n/).filter(line => {
    const trimmed = line.trim();
    const link = trimmed.match(/^\[([^\]]+)\]\((?:[^)]*\)\s*|[^)]*)$/);
    const label = (link ? link[1] : trimmed).replace(/^#{1,6}\s+/, '').trim();
    return !navigationLabel.test(label);
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function cleanPreview(text) {
  return cleanReaderText(text)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ').trim();
}

export function itemPreview(item) {
  return item.kind === 'link' ? cleanPreview(item.description || '') : item.description || '';
}
