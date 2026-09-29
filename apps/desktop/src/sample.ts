/**
 * The sample plan from first-run setup: a real-looking plan with the repo
 * files it mentions, so Frank can show what he does before the developer's
 * next agent run. It's the engine's rate-limit fixture.
 */
import type { FileContext, Plan } from '@frank/engine';
import body from '../../../packages/engine/fixtures/rate-limit/plan.md?raw';
import compose from '../../../packages/engine/fixtures/rate-limit/files/docker-compose.yml?raw';
import server from '../../../packages/engine/fixtures/rate-limit/files/src/server.ts?raw';

export const SAMPLE_ORIGIN = 'sample';

export function samplePlan(now = new Date()): Plan {
  return {
    source: 'claude-code',
    title: 'Add rate limiting to the public API',
    body,
    project: '~/code/sample-api',
    modifiedAt: new Date(now.getTime() - 3 * 60_000).toISOString(),
    origin: SAMPLE_ORIGIN,
  };
}

export const SAMPLE_FILES: FileContext[] = [
  { path: 'docker-compose.yml', content: compose, truncated: false },
  { path: 'src/server.ts', content: server, truncated: false },
];
