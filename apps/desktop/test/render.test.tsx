/**
 * The panel as drawn: what each part shows for a given state. Rendered to
 * markup, so these run without a browser.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelController, planKey, type PanelState } from '../src/controller.ts';
import { demoHost } from '../src/demo.ts';
import { planLines } from '../src/planLines.ts';
import { CallView } from '../src/ui/CallView.tsx';
import { Composer } from '../src/ui/Composer.tsx';
import { MarginDuck } from '../src/ui/MarginDuck.tsx';
import { PlansHome } from '../src/ui/PlansHome.tsx';
import { PlanText } from '../src/ui/PlanText.tsx';
import { TheRead } from '../src/ui/TheRead.tsx';
import { ControllerContext } from '../src/ui/store.ts';

/** A controller that has read the sample plan. */
async function afterTheRead(opts: Parameters<typeof demoHost>[0] = {}) {
  const c = new PanelController(demoHost({ delay: 0, utterances: [], ...opts }));
  await c.start();
  await c.confirmContext(true);
  return c;
}

/** Draws `ui` as the panel would with `c`'s state, changed by `change`. */
function draw(
  c: PanelController,
  ui: ReactNode,
  change: Partial<PanelState> = {},
): string {
  const state = { ...c.getSnapshot(), ...change };
  const fake = Object.assign(Object.create(c) as PanelController, {
    state,
    getSnapshot: () => state,
    subscribe: () => () => {},
  });
  return renderToStaticMarkup(
    <ControllerContext.Provider value={fake}>{ui}</ControllerContext.Provider>,
  );
}

/** The class lists of the elements with `cls` among them. */
function classesOf(html: string, cls: string): string[] {
  return [...html.matchAll(/class="([^"]*)"/g)]
    .map((m) => m[1]!)
    .filter((c) => c.split(' ').includes(cls));
}

describe('the plan, marked', () => {
  it("underlines each call's words, with its number and a note where it starts", async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const { plan, calls } = c.getSnapshot();
    const html = renderToStaticMarkup(
      <PlanText lines={planLines(plan!.body, calls)} calls={calls} onOpen={() => {}} />,
    );
    for (const call of calls) {
      expect(html).toContain(`aria-label="Call ${call.id}: ${call.question}"`);
      expect(html).toContain(`data-anchor="call:${call.id}"`);
    }
    // Counter storage: the code disagrees with the plan.
    expect(classesOf(html, 'plan-mark')).toEqual([
      'plan-mark',
      'plan-mark flagged',
      'plan-mark',
    ]);
    expect(classesOf(html, 'plan-note')).toContain('plan-note flagged');
    expect(html).toMatch(/class="plan-gutter"[^>]*>1</);
  });

  it('marks what was decided, and what Frank is talking about', async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const { plan, calls } = c.getSnapshot();
    const decided = calls.map((x) =>
      x.id === '1' ? { ...x, outcome: { verdict: 'keep' as const } } : x,
    );
    const html = renderToStaticMarkup(
      <PlanText lines={planLines(plan!.body, decided)} calls={decided} current="3" />,
    );
    // Without a way to open them, marks are plain marks.
    expect(html).not.toContain('role="button"');
    expect(classesOf(html, 'plan-mark')).toEqual([
      'plan-mark current',
      'plan-mark made',
      'plan-mark',
    ]);
    expect(classesOf(html, 'plan-note')).toContain('plan-note made');
  });

  it("a call's excerpt marks only that call, with no margin notes", async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const { plan, calls } = c.getSnapshot();
    const html = renderToStaticMarkup(
      <PlanText lines={planLines(plan!.body, calls)} calls={calls} only="2" />,
    );
    expect(classesOf(html, 'plan-mark')).toEqual(['plan-mark']);
    expect(html).toContain('Apply the limiter to every route');
    expect(html).not.toContain('plan-note');
    expect(html).not.toContain('data-anchor');
  });
});

describe('the read', () => {
  it("shows Frank's gist where the duck starts, the plan without its title, and what's fine", async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const html = draw(c, <TheRead />);
    expect(html).toMatch(/class="gist" data-anchor="plan">Adds a per-key limit/);
    // The title is in the header already.
    expect(html).not.toContain('data-level="1"');
    expect(html).toContain('data-level="2"');
    expect(html).toContain(
      'Checked and fine: the 429 response and its Retry-After header; the rate limit tests.',
    );
  });

  it('says it is reading until the gist comes in', async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const html = draw(c, <TheRead />, { gist: '', calls: [], fine: [], reading: true });
    expect(html).toContain('class="gist quiet" data-anchor="plan">Reading the plan<');
    expect(html).not.toContain('Checked and fine');
  });
});

describe('the two sides of a call', () => {
  const sides = (html: string) =>
    [...html.matchAll(/class="side"[^>]*>(.*?)<\/button>/g)].map((m) => m[0]);
  const columns = (html: string) => html.split('class="answer-col"').slice(1);

  it("puts the plan's choice beside the alternative, each answer under its side", async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const html = draw(c, <CallView />, { view: { name: 'call' }, selected: '1' });
    const [plan, instead] = sides(html);
    expect(plan).toContain('>The plan<');
    expect(plan).toContain('Redis');
    expect(plan).toContain('a new service to run');
    expect(instead).toContain('>Instead<');
    expect(instead).toContain('In memory');
    expect(html).toContain(
      'It comes down to: Will you run more than one API instance soon?',
    );
    const [left, right] = columns(html);
    expect(left).toContain('Yes');
    expect(left).not.toContain('No');
    expect(right).toContain('No');
    // The excerpt marks this call's words, in the plan's own lines.
    expect(html).toContain('Use Redis to share counters across instances');
  });

  it('shows what was chosen, what an answer points to, and a third way', async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const calls = c.getSnapshot().calls.map((x) =>
      x.id === '1'
        ? {
            ...x,
            outcome: { verdict: 'change' as const, detail: 'In memory', option: 2 },
            options: [
              ...x.options,
              {
                label: 'Leave it out',
                gain: 'nothing to build',
                cost: 'no limit',
                instruction: '',
              },
            ],
          }
        : x,
    );
    const html = draw(c, <CallView />, {
      view: { name: 'call' },
      selected: '1',
      calls,
      answers: { '1': 1 },
      highlight: { option: 2, why: 'answer' },
    });
    const [plan, instead] = sides(html);
    expect(plan).toContain('aria-pressed="false"');
    expect(instead).toContain('aria-pressed="true"');
    expect(instead).toContain('data-lit="true"');
    expect(instead).toContain('>chosen<');
    expect(html).toContain(
      'Also possible: <strong>Leave it out</strong>, nothing to build, but no limit',
    );
    expect(columns(html)[1]).toMatch(/class="answer" aria-pressed="true"/);
  });
});

describe('the duck in the margin', () => {
  const duck = (html: string) => classesOf(html, 'margin-duck')[0];

  it('talks, listens, thinks, waits and rests', async () => {
    const c = await afterTheRead({ mode: 'chat' });
    const at = (change: Partial<PanelState>) =>
      duck(draw(c, <MarginDuck fallback="plan" />, change));
    expect(at({})).toBe('margin-duck resting');
    expect(at({ voice: { state: 'speaking' } })).toBe('margin-duck talking');
    expect(at({ handsFree: { state: 'hearing', level: 0.4 } })).toBe(
      'margin-duck listening',
    );
    expect(at({ voice: { state: 'listening', level: 0.2 } })).toBe(
      'margin-duck listening',
    );
    // Waiting for you to talk isn't hearing you.
    expect(at({ handsFree: { state: 'waiting', level: 0 } })).toBe('margin-duck resting');
    expect(at({ reading: true })).toBe('margin-duck thinking');
    expect(at({ streaming: { callId: '1', text: '' } })).toBe('margin-duck thinking');
    expect(at({ turnKind: 'hold' })).toBe('margin-duck waiting');
  });
});

describe('the plans home', () => {
  it('numbers the plans and says how far each got', async () => {
    const c = await afterTheRead({ mode: 'chat' });
    await c.showPlans();
    const { history, plan } = c.getSnapshot();
    const [open, jwt, logger] = history;
    const html = draw(c, <PlansHome />, {
      visits: {
        [planKey(open!)]: { made: 1, total: 3, copied: false },
        [planKey(jwt!)]: { made: 0, total: 1, copied: true },
      },
    });
    const rows = html.split('<li>').slice(1);
    expect(rows).toHaveLength(3);
    expect(planKey(open!)).toBe(planKey(plan!));
    expect(rows[0]).toContain('aria-current="true"');
    expect(rows[0]).toMatch(/class="plan-number"[^>]*>1</);
    expect(rows[0]).toMatch(/class="plan-row-status">1 of 3 decided</);
    expect(rows[1]).toMatch(/class="plan-row-status">note copied</);
    expect(rows[2]).toContain(logger!.title);
    expect(rows[2]).toMatch(/class="plan-row-status"><\/span>/);
  });

  it('knows a plan that was only read, or had nothing to decide', async () => {
    const c = await afterTheRead({ mode: 'chat' });
    await c.showPlans();
    const [open, jwt, logger] = c.getSnapshot().history;
    const html = draw(c, <PlansHome />, {
      visits: {
        [planKey(open!)]: { made: 0, total: 3, copied: false },
        [planKey(jwt!)]: { made: 0, total: 1, copied: false },
        [planKey(logger!)]: { made: 0, total: 0, copied: false },
      },
    });
    const status = [...html.matchAll(/class="plan-row-status">([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(status).toEqual(['open now', 'read', 'nothing needed you']);
  });
});

describe('the voice bar', () => {
  const words = (html: string) =>
    /class="voice-status voice-bar[^"]*"[^>]*>.*?<span>([^<]*)<\/span>/.exec(html)?.[1];

  it("says whose turn it is, and how long you've got", async () => {
    const c = await afterTheRead();
    const bar = (change: Partial<PanelState>) =>
      words(draw(c, <Composer />, { view: { name: 'read' }, ...change }));
    const waiting = { handsFree: { state: 'waiting' as const, level: 0 } };
    expect(bar({ voice: { state: 'speaking' } })).toBe(
      'Frank is talking. Any key to cut in.',
    );
    expect(bar({ voice: { state: 'off' }, reading: true })).toBe(
      'Frank is reading the plan',
    );
    expect(bar({ voice: { state: 'off' }, streaming: { callId: '1', text: '' } })).toBe(
      'Thinking it over',
    );
    expect(bar({ voice: { state: 'off' }, ...waiting, turnKind: 'normal' })).toBe(
      'Your turn. Just talk.',
    );
    expect(bar({ voice: { state: 'off' }, ...waiting, turnKind: 'long' })).toBe(
      'Your turn. Take your time; pauses are fine.',
    );
    expect(bar({ voice: { state: 'off' }, ...waiting, turnKind: 'hold' })).toBe(
      'Take your time.',
    );
    expect(
      bar({ voice: { state: 'off' }, handsFree: { state: 'hearing', level: 0.5 } }),
    ).toBe('Hearing you');
    expect(
      bar({
        voice: { state: 'off' },
        ...waiting,
        view: { name: 'plans' },
        history: [c.getSnapshot().plan!],
      }),
    ).toBe('Which plan? Say its name, or pick one.');
    expect(bar({ voice: { state: 'off' }, handsFree: undefined })).toBe(
      'Tap Space to talk',
    );
  });

  it('shows the last thing each of you said', async () => {
    const c = await afterTheRead();
    const html = draw(c, <Composer />, {
      view: { name: 'read' },
      lastHeard: 'the redis one',
      lastLine: 'Walk me through this bit.',
    });
    expect(html).toMatch(
      /class="said-you"><span class="who">You<\/span> <span class="words">the redis one</,
    );
    expect(html).toMatch(
      /class="said-frank"><span class="who">Frank<\/span> <span class="words">Walk me through this bit\.</,
    );
    const quiet = draw(c, <Composer />, {
      view: { name: 'read' },
      lastHeard: undefined,
      lastLine: undefined,
    });
    expect(quiet).not.toContain('class="said"');
  });

  it('turns into a text box to type, and stays one in chat mode', async () => {
    const voice = await afterTheRead();
    expect(
      draw(voice, <Composer />, {
        view: { name: 'read' },
        typing: true,
        handsFree: undefined,
      }),
    ).toContain('<textarea');
    const chat = await afterTheRead({ mode: 'chat' });
    const html = draw(chat, <Composer />, { view: { name: 'read' } });
    expect(html).toContain('<textarea');
    expect(html).not.toContain('voice-bar');
  });
});
