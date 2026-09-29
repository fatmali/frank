import { describe, expect, it } from 'vitest';
import { PanelController, speakable, spokenSentences } from '../src/controller.ts';
import { DEMO_SCRIPT, demoHost } from '../src/demo.ts';
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
    expect(s.fine).toContain('the 429 response and its Retry-After header');
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
    const { host, c } = await startSession({
      mode: 'chat',
      utterances: ['no', 'take it'],
    });
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
    const { host, c } = await startSession({
      mode: 'chat',
      utterances: ['What would you do?'],
    });
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
    const { host, c } = await startSession({ mode: 'chat' });
    c.beginCalls();
    await c.send('Why not Redis?');
    expect(c.getSnapshot().turns).toHaveLength(2);
    expect(host.calls.some((x) => x.startsWith('speak'))).toBe(false);
  });

  it('asks before downloading the speech models', async () => {
    const { c } = await startSession({ mode: 'chat', voiceModel: false });
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
    const { c } = await startSession({ mode: 'chat', utterances: [''] });
    c.beginCalls();
    await c.startTalking();
    await c.stopTalking();
    await settle(c, (x) => x.getSnapshot().voiceError !== undefined);
    expect(c.getSnapshot().voiceError).toBe(
      "Didn't catch that. Hold, talk, then let go.",
    );
  });

  it('keeps spoken answers short, and typed ones as they were', async () => {
    const { host, c } = await startSession({
      mode: 'chat',
      utterances: ['Why not Redis?'],
    });
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
    expect(c.getSnapshot().view.name).toBe('plans');
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
    const { host, c } = await startSession({ mode: 'chat' });
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
    const { host, c } = await startSession({
      mode: 'chat',
      utterances: ['What would you do?'],
    });
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
    const { host, c } = await startSession({
      mode: 'chat',
      utterances: ['no', 'take it'],
    });
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

describe("Frank's voice", () => {
  it('opens from the panel and closes on Esc without closing the panel', async () => {
    const { host, c } = await startSession();
    c.beginCalls();
    c.toggleVoiceMenu();
    expect(c.getSnapshot().voiceMenuOpen).toBe(true);
    await c.showPlans();
    expect(c.getSnapshot().voiceMenuOpen).toBe(false);
    await c.load(c.getSnapshot().history[0]!);
    c.toggleVoiceMenu();
    await c.close();
    expect(c.getSnapshot().voiceMenuOpen).toBe(false);
    expect(host.calls).not.toContain('hide');
  });
});

describe('voice first', () => {
  const said = (host: { calls: string[] }) =>
    host.calls.filter((x) => x.startsWith('speak ')).map((x) => x.slice(6));

  it('briefs you on the plan, then listens', async () => {
    const { host, c } = await startSession({ utterances: [] });
    expect(said(host)).toEqual([
      "Claude Code's plan adds a per-key limit of 100 requests a minute to the public API, with counters kept in Redis, so one noisy key can't slow the API down for everyone.",
      'Three things in it need you: counter storage, limited routes and new dependencies.',
      'Counter storage is the hardest to undo. Where should we start?',
    ]);
    // His turn is over once he's asked; the microphone opens by itself.
    await settle(c, (x) => x.getSnapshot().handsFree?.state === 'waiting');
    expect(host.calls.indexOf('handsFreeStart')).toBeGreaterThan(
      host.calls.findLastIndex((x) => x.startsWith('speak ')),
    );
  });

  it('shows what he is talking about as he says it', async () => {
    const { c } = await startSession({ utterances: [] });
    const about = new Set<string>();
    c.subscribe(() => {
      const s = c.getSnapshot().speakingAbout;
      if (s) about.add(s);
    });
    c.beginCalls();
    await settle(c, (x) => x.getSnapshot().handsFree?.state === 'waiting');
    expect([...about]).toContain('call:1');
  });

  it('talks a whole plan through by voice, and copies the note', async () => {
    const { host, c } = await startSession({
      utterances: [
        'the redis one',
        'so it keeps counters in redis for more than one instance, but we only run one',
        'yes',
        'keep it',
        'keep it',
        'yes',
      ],
    });
    await settle(c, (x) => x.getSnapshot().noteCopied);
    const s = c.getSnapshot();
    expect(s.calls.map((x) => x.outcome)).toEqual([
      { verdict: 'change', detail: expect.stringMatching(/in memory/), option: 2 },
      { verdict: 'keep' },
      { verdict: 'keep' },
    ]);
    expect(host.copied[0]).toMatch(/Revise the plan/);
    const lines = said(host);
    // Frank hands each call over to be walked through, and your walk-through
    // answered what the first one comes down to.
    expect(lines).toContain("Walk me through this bit. What's the plan doing here?");
    expect(lines).toContain(
      "Right, and there's no Redis in docker-compose.yml either, so it's a new service for an instance you don't have.",
    );
    expect(lines).toContain('Then in memory. Go with that?');
    expect(lines).toContain('Going with in memory.');
    expect(lines).toContain(
      "That's all three. You changed one thing: counter storage, in memory. Want me to copy the note for Claude Code?",
    );
    expect(lines.at(-1)).toBe('Note copied. Paste it into Claude Code.');
    // The brain heard the read and the walk-through; everything else was on-device.
    expect(host.calls.filter((x) => x === 'stream')).toHaveLength(2);
    // Walk-throughs get patience; yes-or-no questions don't.
    expect(host.calls).toContain('patience long');
    expect(host.calls).toContain('patience short');
  });

  it('the demo script talks the sample through, with a question to the brain', async () => {
    const { host, c } = await startSession({ utterances: [...DEMO_SCRIPT] });
    await settle(c, (x) => x.getSnapshot().noteCopied);
    expect(c.getSnapshot().calls.map((x) => x.outcome?.verdict)).toEqual([
      'change',
      'change',
      'keep',
    ]);
    // The read, the walk-through, and "what would you do?".
    expect(host.calls.filter((x) => x === 'stream')).toHaveLength(3);
  });

  it('answers questions out loud, even typed ones', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    const before = said(host).length;
    await c.send('What would you do?');
    await settle(c, () => said(host).length > before);
    expect(said(host).slice(before)).toContain('In memory.');
  });

  it('Esc stops him talking, then stops listening, then closes', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    expect(c.getSnapshot().voice.state).toBe('speaking');
    await c.close();
    expect(c.getSnapshot().voice.state).toBe('off');
    await settle(c, (x) => x.getSnapshot().handsFree !== undefined);
    await c.close();
    await settle(c, (x) => x.getSnapshot().handsFree === undefined);
    expect(host.calls).not.toContain('hide');
    await c.close();
    expect(host.calls).toContain('hide');
  });

  it("stays quiet until his voice is downloaded, and doesn't ask twice", async () => {
    const { host, c } = await startSession({ naturalVoices: false, utterances: [] });
    expect(said(host)).toEqual([]);
    expect(c.getSnapshot().voice.state).not.toBe('needs-pack');
    expect(c.getSnapshot().gist).toMatch(/^Adds a per-key limit/);
  });

  it('chat mode keeps to the panel', async () => {
    const { host, c } = await startSession({ mode: 'chat', utterances: [] });
    c.beginCalls();
    expect(said(host)).toEqual([]);
    expect(host.calls).not.toContain('handsFreeStart');
  });
});

describe('first run', () => {
  it('voice downloads what it needs in the background; chat downloads nothing', async () => {
    const host = demoHost({ delay: 0, voiceModel: false, naturalVoices: false });
    const c = new PanelController(host);
    await c.start();
    await c.chooseMode('voice');
    expect(voiceModeOf(c)).toBe('voice');
    await settle(c, (x) => !!x.getSnapshot().packs?.voices.installed);
    expect(c.getSnapshot().packs?.listening.installed).toBe(true);
    expect(host.calls.filter((x) => x.startsWith('download'))).toEqual([
      'download listening',
      'download voices',
    ]);

    const quiet = demoHost({ delay: 0, voiceModel: false, naturalVoices: false });
    const q = new PanelController(quiet);
    await q.start();
    await q.chooseMode('chat');
    expect(voiceModeOf(q)).toBe('chat');
    expect(quiet.calls.filter((x) => x.startsWith('download'))).toEqual([]);
  });
});

function voiceModeOf(c: PanelController) {
  return c.voiceFirst ? 'voice' : 'chat';
}

describe('the plans home', () => {
  const said = (host: { calls: string[] }) =>
    host.calls.filter((x) => x.startsWith('speak ')).map((x) => x.slice(6));

  it('grabs the newest plan you have not talked through, else shows your plans', async () => {
    const { host, c } = await startSession({ mode: 'chat' });
    expect(c.getSnapshot().plan?.title).toBe('Add rate limiting to the public API');
    await c.showPlans();
    const s = c.getSnapshot();
    expect(s.view.name).toBe('plans');
    expect(s.history.map((p) => p.title)).toEqual([
      'Add rate limiting to the public API',
      'Move sessions to JWT',
      'Tidy the logger',
    ]);
    // Summoned again with nothing new, Frank stays on the home.
    await c.start();
    expect(c.getSnapshot().view.name).toBe('plans');
    expect(host.calls).toContain('pinned true');
  });

  it('picks a plan by voice, and comes back to where you left off', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    c.choose(2); // counters in memory; on to the health check
    expect(c.getSnapshot().selected).toBe('2');

    await c.send('show my plans', true);
    expect(c.getSnapshot().view.name).toBe('plans');
    expect(said(host)).toContain('Which plan?');
    expect(Object.values(c.getSnapshot().visits)[0]).toEqual({
      made: 1,
      total: 3,
      copied: false,
    });

    await c.send('the JWT one', true);
    await settle(c, (x) => x.getSnapshot().plan?.title === 'Move sessions to JWT');
    await settle(c, (x) => x.getSnapshot().view.name === 'read');
    expect(c.getSnapshot().calls.map((x) => x.title)).toEqual(['Sessions table']);

    await c.showPlans();
    await c.send('the rate limiting one', true);
    const back = c.getSnapshot();
    expect(back.plan?.title).toBe('Add rate limiting to the public API');
    expect(back.view.name).toBe('call');
    expect(back.selected).toBe('2');
    expect(back.calls[0]!.outcome).toMatchObject({ verdict: 'change', option: 2 });
    expect(said(host)).toContain('Back to Add rate limiting to the public API.');
    // Nothing was read twice.
    expect(host.calls.filter((x) => x === 'stream')).toHaveLength(2);
  });
});

describe('walking Frank through a call', () => {
  const said = (host: { calls: string[] }) =>
    host.calls.filter((x) => x.startsWith('speak ')).map((x) => x.slice(6));

  it('"you explain it" gets his explanation, and what it comes down to', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    await c.send('you explain it', true);
    expect(said(host)).toContain(
      'It comes down to: will you run more than one API instance soon?',
    );
  });

  it('"hold on" waits as long as it takes, and says nothing', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    await settle(c, (x) => x.getSnapshot().voice.state !== 'speaking');
    const before = said(host).length;
    await c.send('hold on', true);
    expect(said(host)).toHaveLength(before);
    expect(c.getSnapshot().flash).toBe('Take your time.');
  });

  it('"I don\'t know" gets the option easiest to change', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    await c.send("I don't know", true);
    expect(c.getSnapshot().highlight).toEqual({ option: 2, why: 'frank' });
    expect(host.calls.filter((x) => x === 'stream')).toHaveLength(2);
  });

  it('"wait, what?" says the last thing again', async () => {
    const { host, c } = await startSession({ utterances: [] });
    c.beginCalls();
    await c.send('wait, what?', true);
    const lines = said(host);
    expect(lines.filter((l) => l.startsWith('Walk me through this bit'))).toHaveLength(2);
  });
});
