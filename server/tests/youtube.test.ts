import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubePageMetadata } from '../youtube.js';

test('YouTube fallback extracts metadata only and labels abbreviated descriptions', () => {
  const result = youtubePageMetadata('<meta property="og:title" content="Caching &amp; latency"><meta name="description" content="A short overview"><script>transcript = "Do not ingest this"</script><body>Unrelated recommendations</body>');
  assert.equal(result.title, 'Caching & latency');
  assert.equal(result.text, 'Caching & latency\n\nA short overview');
  assert.equal(result.coverage, 'metadata only');
  assert.equal(result.details?.descriptionMayBeTruncated, true);
});

test('YouTube fallback rejects generic or blocked pages and accepts title-only metadata', () => {
  assert.throws(() => youtubePageMetadata('<title>Consent</title>'), /unavailable/);
  assert.throws(() => youtubePageMetadata('<meta property="og:title" content="YouTube">'), /unavailable/);
  assert.equal(youtubePageMetadata('<meta property="og:title" content="Specific video">').text, 'Specific video');
});
