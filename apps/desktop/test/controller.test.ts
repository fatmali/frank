import { describe, expect, it } from 'vitest';
import { PanelController } from '../src/controller.ts';
import { demoHost } from '../src/demo.ts';
import { BrainFailure } from '../src/host.ts';

async function settle(c: PanelController, until: (c: PanelController) => boolean) {
  for (let i = 0; i < 200 && !until(c); i++) await new Promise((r) => setTimeout(r, 5));
  expect(until(c)).toBe(true);
}

describe('a session, end to end', () => {
  it('finds the calls, talks them through and copies the note', async () => {
    const host = demoHost({ delay: 0 });
    const c = new PanelController(host);
    await c.start();

    // First use in this project: Frank shows the files before sending anything.
    const check = c.getSnapshot().view;
    expect(check.name).toBe('context-check');
    if (check.name !== 'context-check') return;
    expect(check.gathered.files.map((f) => f.path)).toEqual([
      'docker-compose.yml',
      'src/server.ts',
    ]);

    await c.confirmContext(true);
    let s = c.getSnapshot();
    expect(s.view.name).toBe('session');
    expect(s.calls.map((x) => x.title)).toEqual([
      'Store counts in Redis',
      'Apply to every route',
      'Add express-rate-limit',
    ]);
    expect(s.calls[0]!.contradicted).toBe(true);
    // Call 1 is open, and Frank has said his piece about it.
    expect(s.selected).toBe('1');
    expect(s.turns[0]!.text).toMatch(/no Redis in docker-compose/i);

    await c.whatWouldYouDo();
    expect(c.getSnapshot().turns.at(-1)!.text).toMatch(/in-memory counters/);

    await c.act('change');
    expect(c.getSnapshot().changing).toBe(true);
    await c.send('Use in-memory counters; we run one instance');
    s = c.getSnapshot();
    expect(s.changing).toBe(false);
    expect(s.selected).toBe('2');
    expect(s.turns[0]!.text).toMatch(/\/health/);

    await c.act('drop');
    await c.act('keep');
    s = c.getSnapshot();
    expect(s.progress).toEqual({ made: 3, total: 3 });

    await c.copyNote();
    expect(host.copied[0]).toBe(
      [
        'Revise the plan before building:',
        '- Store counts in Redis. Instead: Use in-memory counters; we run one instance.',
        '- Drop: Apply to every route.',
        '- Keep: Adds two dependencies.',
        'Everything else stays as planned.',
      ].join('\n'),
    );
    expect(c.getSnapshot().notice).toBe('Note copied. Paste it into Claude Code.');
  });

  it("doesn't ask again for a trusted project, and resumes on the next summon", async () => {
    const host = demoHost({ delay: 0 });
    const c = new PanelController(host);
    await c.start();
    await c.confirmContext(true);
    await c.select('3');
    await c.start();
    const s = c.getSnapshot();
    expect(s.view.name).toBe('session');
    expect(s.selected).toBe('3');

    const again = new PanelController(host);
    await again.start();
    expect(again.getSnapshot().view.name).toBe('session');
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
    await settle(c, (x) => x.getSnapshot().calls.length === 3);
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

  it('Esc backs out of Change before closing', async () => {
    const host = demoHost({ delay: 0 });
    const c = new PanelController(host);
    await c.start();
    await c.confirmContext(false);
    await c.act('change');
    await c.close();
    expect(c.getSnapshot().changing).toBe(false);
    expect(host.calls).not.toContain('hide');
    await c.close();
    expect(host.calls).toContain('hide');
  });
});
