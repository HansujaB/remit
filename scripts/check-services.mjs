import 'dotenv/config';
import { apifyTarget } from '../dist-server/apify.js';

// Read-only credential checks; never log tokens, response bodies, or account data.
async function check(name, url, headers = {}, validate = () => true) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => ({}));
    const ok = response.ok && validate(body);
    console.log(`${name}: ${ok ? 'PASS' : 'FAIL'} (HTTP ${response.status})`);
    if (!ok) process.exitCode = 1;
  } catch {
    console.log(`${name}: FAIL (connection or timeout)`);
    process.exitCode = 1;
  }
}
const bearer = value => ({ Authorization: `Bearer ${value}` });
const jobs = [];
for (const key of ['CLERK_SECRET_KEY','VITE_CLERK_PUBLISHABLE_KEY','GROQ_API_KEY','APIFY_TOKEN','YOUTUBE_API_KEY']) {
  console.log(`${key}: ${process.env[key]?.trim() ? 'set' : 'MISSING'}`);
  if (!process.env[key]?.trim()) process.exitCode = 1;
}
if (process.env.CLERK_SECRET_KEY) jobs.push(check('Clerk backend key', 'https://api.clerk.com/v1/users?limit=1', bearer(process.env.CLERK_SECRET_KEY)));
if (process.env.GROQ_API_KEY) jobs.push(check('Groq configured model', 'https://api.groq.com/openai/v1/models', bearer(process.env.GROQ_API_KEY), body => body.data?.some(m => m.id === (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'))));
if (process.env.YOUTUBE_API_KEY) jobs.push(check('YouTube title/description', `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=jNQXAC9IVRw&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`, {}, body => !!body.items?.[0]?.snippet?.title));
if (process.env.APIFY_TOKEN) {
  jobs.push(check('Apify token', 'https://api.apify.com/v2/users/me', bearer(process.env.APIFY_TOKEN)));
  for (const platform of ['INSTAGRAM','PINTEREST','X']) {
    try {
      const target = apifyTarget(platform);
      jobs.push(check(`Apify ${platform} ${target.kind}`, `https://api.apify.com/v2/${target.path}`, bearer(process.env.APIFY_TOKEN)));
    } catch { console.log(`Apify ${platform} target: MISSING`); process.exitCode = 1; }
  }
}
console.log('R2: SKIPPED (setup pending)');
await Promise.all(jobs);
