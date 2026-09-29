import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Brain, BrainRequest, Context, FileContext } from '../src/types.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

/** Builds a Context from a fixture folder: its plan plus every file under files/. */
export function loadFixture(name: string): Context {
  const dir = join(FIXTURES, name);
  const body = readFileSync(join(dir, 'plan.md'), 'utf8');
  const title = body.match(/^#\s+(.+)$/m)?.[1] ?? name;
  const filesDir = join(dir, 'files');
  const files: FileContext[] = walk(filesDir).map((path) => ({
    path: relative(filesDir, path),
    content: readFileSync(path, 'utf8'),
    truncated: false,
  }));
  return {
    plan: {
      source: 'claude-code',
      title,
      body,
      modifiedAt: '2026-09-28T10:00:00Z',
      origin: `fixtures/${name}/plan.md`,
    },
    files,
    extras: [],
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * A brain that replies from a script, in order, and records every request.
 * Replies stream in small chunks, like a real brain.
 */
export class ScriptedBrain implements Brain {
  readonly id = 'scripted';
  readonly requests: BrainRequest[] = [];
  private replies: (string | Error)[];

  constructor(replies: (string | Error)[]) {
    this.replies = [...replies];
  }

  async *stream(request: BrainRequest): AsyncIterable<string> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('ScriptedBrain ran out of replies');
    if (reply instanceof Error) throw reply;
    for (let i = 0; i < reply.length; i += 7) yield reply.slice(i, i + 7);
  }
}

export async function drain(chunks: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const c of chunks) out += c;
  return out;
}

/** A well-formed read of the rate-limit fixture, as a good brain would return it. */
export const RATE_LIMIT_BREAKDOWN = JSON.stringify({
  gist: 'Adds a per-key limit of 100 requests a minute to the public API, with counters in Redis.',
  calls: [
    {
      title: 'New dependencies',
      question: 'Is express-rate-limit worth adding?',
      kind: 'silent-choice',
      planQuote: 'Add express-rate-limit and rate-limit-redis as dependencies',
      stakes: 'Two new packages to keep updated.',
      options: [
        {
          label: 'Both packages',
          gain: 'standard, well tested',
          cost: 'two dependencies',
          instruction: 'Add express-rate-limit and rate-limit-redis.',
        },
        {
          label: 'express-rate-limit only',
          gain: 'one dependency',
          cost: 'no shared counters',
          instruction: 'Add express-rate-limit only, with its memory store.',
        },
      ],
      undoCost: 'easy',
      contradicted: false,
      evidence: [],
    },
    {
      title: 'Counter storage',
      question: 'Where should the counters live?',
      kind: 'option',
      planQuote: 'Use Redis to share counters across instances',
      stakes: 'Redis is a new service to deploy, secure and watch.',
      options: [
        {
          label: 'Redis',
          gain: 'works across instances',
          cost: 'a new service to run',
          instruction: 'Keep counters in Redis, shared across instances.',
        },
        {
          label: 'In memory',
          gain: 'nothing new to run',
          cost: 'resets on deploy',
          instruction: 'Keep counters in memory in the API process instead of Redis.',
        },
      ],
      hinge: {
        question: 'Will you run more than one instance soon?',
        answers: [
          { answer: 'Yes', option: 1 },
          { answer: 'No', option: 2 },
        ],
      },
      undoCost: 'hard',
      contradicted: true,
      evidence: [
        { file: 'docker-compose.yml', line: 1, note: 'Only api and postgres; no Redis' },
      ],
    },
    {
      title: 'Limited routes',
      question: 'Should /health be rate limited?',
      kind: 'silent-choice',
      planQuote: 'Apply the limiter to every route in src/server.ts',
      stakes: 'The load balancer polls /health every 2 seconds.',
      options: [
        {
          label: 'Every route',
          gain: 'one rule everywhere',
          cost: 'can throttle health checks',
          instruction: 'Apply the limiter to every route.',
        },
        {
          label: 'Public API only',
          gain: 'health checks untouched',
          cost: 'internal routes unlimited',
          instruction: 'Apply the limiter to /api/public only; leave /health alone.',
        },
      ],
      undoCost: 'medium',
      contradicted: false,
      evidence: [
        { file: 'src/server.ts', line: 8, note: '/health is polled every 2 seconds' },
      ],
    },
  ],
  fine: ['429 with a Retry-After header', 'Tests in test/rateLimit.test.ts'],
});

/** The same breakdown in the older shape: no gist, options or hinge. */
export const LEGACY_BREAKDOWN = JSON.stringify({
  calls: [
    {
      title: 'Add express-rate-limit',
      kind: 'silent-choice',
      planQuote: 'Add `express-rate-limit` and `rate-limit-redis` as dependencies',
      planChoice: 'Adds two new dependencies',
      alternatives: ['A small hand-written limiter'],
      undoCost: 'easy',
      contradicted: false,
      evidence: [],
    },
    {
      title: 'Store counts in Redis',
      kind: 'option',
      planQuote: 'Use Redis to share counters across instances',
      planChoice: 'Counters live in Redis, shared across instances',
      alternatives: ['In-memory counters'],
      undoCost: 'hard',
      contradicted: true,
      evidence: [
        { file: 'docker-compose.yml', line: 1, note: 'Only api and postgres; no Redis' },
      ],
    },
    {
      title: 'Apply to every route',
      kind: 'silent-choice',
      planQuote: 'Apply the limiter to every route in src/server.ts',
      planChoice: 'Every route is limited, including /health',
      alternatives: ['Only /api/public'],
      undoCost: 'medium',
      contradicted: false,
      evidence: [
        { file: 'src/server.ts', line: 8, note: '/health is polled every 2 seconds' },
      ],
    },
  ],
});
