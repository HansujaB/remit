import { HttpError } from './config.js';

export function apifyTarget(platform: string, env: Record<string, string | undefined> = process.env) {
  const actor = env[`APIFY_${platform}_ACTOR_ID`]?.trim();
  const task = env[`APIFY_${platform}_TASK_ID`]?.trim();
  if (!actor && !task) throw new HttpError(503, `Configure APIFY_${platform}_ACTOR_ID.`);
  return {
    kind: actor ? 'Actor' : 'saved task',
    path: `${actor ? 'acts' : 'actor-tasks'}/${encodeURIComponent((actor || task!).replace('/', '~'))}`,
  };
}
