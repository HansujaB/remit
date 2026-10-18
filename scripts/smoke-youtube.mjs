import assert from 'node:assert/strict';
import { extract } from '../dist-server/extract.js';
if (process.argv.includes('--fallback')) delete process.env.YOUTUBE_API_KEY;

// Tests only title/description extraction, including fallback with the configured key.
try {
  for (const url of ['https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://youtu.be/dQw4w9WgXcQ']) {
    const result = await extract({kind:'link', platform:'YouTube', url}, async () => {});
    assert.ok(result.title);
    assert.ok(result.text.length >= result.title.length);
    assert.equal(result.coverage, 'metadata only');
    assert.ok(result.details.modalities.every(m => ['title','description'].includes(m)));
    console.log(JSON.stringify({status:'PASS', adapter:result.adapter, descriptionAvailable:result.details.modalities.includes('description')}));
  }
} catch (error) {
  console.error(`YouTube extraction: FAIL (${error?.name || 'Error'})`);
  process.exitCode = 1;
}
