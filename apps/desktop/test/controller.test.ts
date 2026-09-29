import { describe, expect, it } from 'vitest';
import { PanelController, speakable, spokenSentences } from '../src/controller.ts';
import { demoHost } from '../src/demo.ts';
import { BrainFailure } from '../src/host.ts';

async function settle(c: PanelController, until: (c: PanelController) => boolean) {
  for (let i = 0; i < 200 && !until(c); i++) await new Promise((r) => setTimeout(r, 5));
  expect(until(c)).toBe(true);
}

async function startSession(opts: Parameters<typeof demoHost>[0] = {}) {
  const host = demoHost({ delay: 0, ...opts });
  const c = new PanelController(host);
  await c.start();
  await c.confirmContext(true);
  return { host, c };
}

describe('the read', () => {
  it('asks before sending files, then says what the plan does and what needs you', async () => {
    const host = demoHost({ delay: 0 });
    const c = new PanelController(host);
    await c.start();
    const check = c.getSnapshot().view;
    expect(check.name).toBe('context-check');
    if (check.name !== 'context-check') return;
    expect(check.gathered.files.map((f) => f.path)).toEqual([
      'docker-compose.yml',
      'src/server.ts',
    ]);

    await c.confirmContext(true);
    const s = c.getSnapshot();
    expect(s.view.name).toBe('read');
    expect(s.reading).toBe(false);
    expect(s.gist).toMatch(/^Adds a per-key limit/);
    expect(s.fine).toContain('429 with a Retry-After header');
    expect(s.calls.map((x) => x.question)).toEqual([
      'Where should the counters live?',
      'Should /health be rate limited?',
      'Are two new packages worth it?',
    ]);
    // No brain calls beyond the read itself: calls are opened from it.
    expect(s.turns).toEqual([]);
  });

  it('fills in as it streams', async () => {
    const host = demoHost({ delay: 1 });
    const c = new PanelController(host);
    await c.start();
    const seen = new Set<number>();
    c.subscribe(() => {
      const s = c.getSnapshot();
      if (s.view.name === 'read' && s.reading) seen.add(s.calls.length);
    });
    await c.confirmContext(false);
    expect([...seen]).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(c.getSnapshot().reading).toBe(false);
  });
});

describe('one call at a time', () => {
  it('answers what it comes down to, takes the option it points to, and moves on', async () => {
    const { c } = await startSession();
    c.beginCalls();
    let s = c.getSnapshot();
    expect(s.view.name).toBe('call');
    expect(s.selected).toBe('1');

    c.answer(1); // "No" to more than one instance
    expect(c.getSnapshot().highlight).toEqual({ option: 2, why: 'answer' });
    c.accept();
    s = c.getSnapshot();
    expect(s.calls[0]!.outcome).toMatchObject({ verdict: 'change', option: 2 });
    expect(s.flash).toBe('Chose In memory');
    expect(s.selected).toBe('2');

    c.choose(1);
    c.drop();
    s = c.getSnapshot();
    expect(s.view.name).toBe('calls');
    expect(s.note).toBe(
      [
        'Revise the plan before building:',
        '- Counter storage: Keep counters in memory in the API process instead of Redis.',
        '- Keep: Apply the limiter to every route.',
        '- Drop: New dependencies.',
        'Everything else stays as planned.',
      ].join('\n'),
    );
  });

  it("offers Frank's take as a suggestion, never a decision", async () => {
    const { c } = await startSession();
    c.beginCalls();
    await c.whatWouldYouDo();
    const s = c.getSnapshot();
    expect(s.turns.at(-1)!.text).toMatch(/^In memory\./);
    expect(s.turns.at(-1)!.text).not.toMatch(/\[option/);
    expect(s.highlight).toEqual({ option: 2, why: 'frank' });
    expect(s.calls[0]!.outcome).toBeUndefined();
  });

  it('skips forward and back; skipped calls stay as planned', async () => {
    const { c } = await startSession();
    c.beginCalls();
    c.next();
    expect(c.getSnapshot().selected).toBe('2');
    c.back();
    c.back();
    expect(c.getSnapshot().view.name).toBe('read');
    c.beginCalls();
    c.next();
    c.next();
    c.next();
    expect(c.getSnapshot().view.name).toBe('calls');
    expect(c.getSnapshot().note).toBe('Go ahead with the plan as written.');
  });

  it('records something else, in the developer’s words', async () => {
    const { c } = await startSession();
    c.beginCalls();
    c.somethingElse();
    await c.send('Use the API gateway’s built-in rate limiting');
    const s = c.getSnapshot();
    expect(s.calls[0]!.outcome).toEqual({
      verdict: 'change',
      detail: 'Use the API gateway’s built-in rate limiting',
    });
    expect(s.selected).toBe('2');
  });
});

describe('talking to Frank', () => {
  it('turns a spoken command into an action, without asking the brain', async () => {
    const { host, c } = await startSession({ utterances: ['no', 'take it'] });
    c.beginCalls();
    await c.startTalking();
    expect(c.getSnapshot().voice).toMatchObject({ state: 'listening' });
    await c.stopTalking();
    await settle(c, (x) => x.getSnapshot().highlight?.option === 2);
    await c.startTalking();
    await c.stopTalking();
    await settle(c, (x) => x.getSnapshot().selected === '2');
    expect(c.getSnapshot().calls[0]!.outcome).toMatchObject({ option: 2 });
    expect(host.calls.filter((x) => x.startsWith('speak'))).toEqual([]);
  });

  it('answers a spoken question out loud, briefly', async () => {
    const { host, c } = await startSession({ utterances: ['What would you do?'] });
    c.beginCalls();
    await c.startTalking();
    await c.stopTalking();
    await settle(c, (x) => x.getSnapshot().turns.length === 2);
    await settle(c, () => host.calls.filter((x) => x.startsWith('speak')).length === 2);
    // A sentence at a time, as soon as each is written; two at most.
    expect(host.calls.filter((x) => x.startsWith('speak'))).toEqual([
      'speak In memory.',
      'speak You run one instance, and Redis is a new service to deploy and watch.',
    ]);
  });

  it('keeps typed questions quiet', async () => {
    const { host, c } = await startSession();
    c.beginCalls();
    await c.send('Why not Redis?');
    expect(c.getSnapshot().turns).toHaveLength(2);
    expect(host.calls.some((x) => x.startsWith('speak'))).toBe(false);
  });

  it('asks before downloading the speech models', async () => {
    const { c } = await startSession({ voiceModel: false });
    c.beginCalls();
    await c.startTalking();
    expect(c.getSnapshot().voice).toEqual({
      state: 'needs-pack',
      pack: 'listening',
      megabytes: 150,
    });
    await c.downloadPack('listening');
    await settle(c, (x) => x.getSnapshot().downloads.listening === undefined);
    expect(c.getSnapshot().voice.state).toBe('off');
    expect(c.getSnapshot().flash).toBe(
      'Voice is ready. Hold Space to talk, or tap it to talk freely.',
    );
  });

  it('says what to say when it heard nothing', async () => {
    const { c } = await startSession({ utterances: [''] });
    c.beginCalls();
    await c.startTalking();
    await c.stopTalking();
    await settle(c, (x) => x.getSnapshot().voiceError !== undefined);
    expect(c.getSnapshot().voiceError).toBe(
      "Didn't catch that. Hold, talk, then let go.",
    );
  });

  it('keeps spoken answers short, and typed ones as they were', async () => {
    const { host, c } = await startSession({ utterances: ['Why not Redis?'] });
    c.beginCalls();
    await c.startTalking();
    await c.stopTalking();
    await settle(c, (x) => x.getSnapshot().turns.length === 2);
    await c.send('And for two instances?');
    const turns = c.getSnapshot().turns.filter((t) => t.role === 'user');
    expect(turns.map((t) => t.text)).toEqual([
      'Why not Redis?',
      'And for two instances?',
    ]);
    expect(host.calls.filter((x) => x.startsWith('speak')).length).toBeGreaterThan(0);
  });

  it('waits for a sentence to finish before saying it', () => {
    expect(spokenSentences('In memory. You run one inst', false)).toEqual(['In memory.']);
    expect(spokenSentences('In memory. You run one inst', true)).toEqual([
      'In memory.',
      'You run one inst',
    ]);
    expect(spokenSentences('Use `v1.2` of it. Done.', false)).toEqual([
      'Use v1.2 of it.',
      'Done.',
    ]);
  });

  it('speaks only the first two sentences, never tables or code', () => {
    expect(
      speakable(
        'In memory. You run one instance, so `Redis` is overkill. Scale later.\n\n| a | b |\n| - | - |',
      ),
    ).toBe('In memory. You run one instance, so Redis is overkill.');
  });
});

describe('around the session', () => {
  it("doesn't ask again for a trusted project, and resumes on the next summon", async () => {
    const { host, c } = await startSession();
    c.beginCalls();
    c.show('3');
    await c.start();
    const s = c.getSnapshot();
    expect(s.view.name).toBe('call');
    expect(s.selected).toBe('3');

    const again = new PanelController(host);
    await again.start();
    expect(again.getSnapshot().view.name).toBe('read');
  });

  it('shows the fix when the brain is not ready', async () => {
    const failure = new BrainFailure(
      'not-ready',
      "Claude Code isn't signed in. Open it, log in, then press Retry.",
    );
    const c = new PanelController(demoHost({ delay: 0, failure }));
    await c.start();
    await c.confirmContext(false);
    expect(c.getSnapshot().view).toEqual({
      name: 'error',
      kind: 'not-ready',
      message: failure.message,
    });
  });

  it('starts setup on first run, then tries the sample plan', async () => {
    const host = demoHost({ delay: 0, firstRun: true });
    const c = new PanelController(host);
    await c.start();
    expect(c.getSnapshot().view.name).toBe('onboarding');
    expect(host.calls).toContain('pinned true');

    const config = await host.getConfig();
    await host.saveConfig({ ...config, brain: { kind: 'claude-code' } });
    expect(await c.testBrain()).toEqual({ ok: true });
    await c.finishOnboarding(true);
    await settle(
      c,
      (x) => x.getSnapshot().calls.length === 3 && !x.getSnapshot().reading,
    );
    expect(c.getSnapshot().plan!.title).toBe('Add rate limiting to the public API');
  });

  it('takes a pasted plan when none was found', async () => {
    const c = new PanelController(demoHost({ delay: 0, plans: [] }));
    await c.start();
    expect(c.getSnapshot().view.name).toBe('no-plan');
    await c.send('# Move sessions to JWT\n1. Drop the sessions table');
    const s = c.getSnapshot();
    expect(s.plan!.source).toBe('pasted');
    expect(s.plan!.title).toBe('Move sessions to JWT');
  });

  it('copies the note and names the agent', async () => {
    const { host, c } = await startSession();
    c.beginCalls();
    c.choose(2);
    await c.copyNote();
    expect(host.copied[0]).toMatch(/^Revise the plan before building:/);
    expect(c.getSnapshot().notice).toBe('Note copied. Paste it into Claude Code.');
  });

  it('Esc backs out of something else before closing', async () => {
    const { host, c } = await startSession();
    c.beginCalls();
    c.somethingElse();
    await c.close();
    expect(c.getSnapshot().changing).toBe(false);
    expect(host.calls).not.toContain('hide');
    await c.close();
    expect(host.calls).toContain('hide');
  });
});

describe('talking freely', () => {
  const speaks = (host: { calls: string[] }) =>
    host.calls.filter((x) => x.startsWith('speak')).length;

  it('hears a thought, answers out loud, then listens again', async () => {
    const { host, c } = await startSession({ utterances: ['What would you do?'] });
    c.beginCalls();
    await c.toggleHandsFree();
    await settle(c, (x) => x.getSnapshot().turns.length === 2);
    expect(speaks(host)).toBeGreaterThan(0);
    // Frank's turn is over once he's said it; then it's the developer's.
    await settle(c, (x) => x.getSnapshot().handsFree?.state === 'waiting');
    expect(host.calls.filter((x) => x === 'handsFreeResume')).toHaveLength(1);
    expect(host.calls.indexOf('handsFreeResume')).toBeGreaterThan(
      host.calls.findLastIndex((x) => x.startsWith('speak')),
    );
  });

  it('acts on a command and listens again straight away', async () => {
    const { host, c } = await startSession({ utterances: ['no', 'take it'] });
    c.beginCalls();
    await c.toggleHandsFree();
    await settle(c, (x) => x.getSnapshot().selected === '2');
    expect(c.getSnapshot().calls[0]!.outcome).toMatchObject({ option: 2 });
    await settle(c, (x) => x.getSnapshot().handsFree?.state === 'waiting');
    expect(speaks(host)).toBe(0);
  });

  it('stops on Esc, and again on a tap', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    await c.toggleHandsFree();
    await settle(c, (x) => x.getSnapshot().handsFree?.state === 'waiting');
    await c.close();
    await settle(c, (x) => x.getSnapshot().handsFree === undefined);
    expect(host.calls).not.toContain('hide');
    await c.toggleHandsFree();
    await settle(c, (x) => x.getSnapshot().handsFree !== undefined);
    await c.toggleHandsFree();
    await settle(c, (x) => x.getSnapshot().handsFree === undefined);
  });

  it('starts by itself once the speech models are downloaded', async () => {
    const { c } = await startSession({ voiceModel: false, utterances: [] });
    c.beginCalls();
    await c.toggleHandsFree();
    expect(c.getSnapshot().voice).toMatchObject({
      state: 'needs-pack',
      pack: 'listening',
    });
    await c.downloadPack('listening');
    await settle(c, (x) => x.getSnapshot().handsFree?.state === 'waiting');
  });
});
