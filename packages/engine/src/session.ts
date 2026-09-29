import { FRANK_SYSTEM, renderCalls, renderContext } from './prompt.ts';
import { composeNote } from './note.ts';
import type { Brain, BrainRequest, Call, Context, Outcome, Turn } from './types.ts';

/**
 * One talk-through: the developer and Frank going over a plan's calls, one at
 * a time. Every turn sends compact state (context, all calls with outcomes,
 * and only the current call's thread) rather than the whole transcript.
 */
/** Added to what the developer said out loud: the answer will be heard, not read. */
const SPOKEN =
  '(I said this out loud and will hear your answer. Reply in one or two short spoken sentences: no lists, tables, code or file paths. If I explicitly asked you to draw, sketch, map or diagram it, you may add one small Mermaid diagram after those sentences; it will be shown, not spoken.)';

export class Session {
  readonly context: Context;
  readonly calls: Call[];
  readonly turns: Turn[] = [];
  selected: string | undefined;
  /** The developer's answer to each call's hinge (0-based answer index). */
  readonly answers: Record<string, number> = {};
  /** The option Frank pointed at in his last reply on a call, if any. */
  suggestion: { callId: string; option: number } | undefined;
  /**
   * What the developer's own words answered, as Frank heard it in his last
   * reply: the call and the answer (0-based) to what it comes down to.
   */
  heardAnswer: { callId: string; answer: number } | undefined;

  constructor(
    private readonly brain: Brain,
    context: Context,
    calls: Call[],
  ) {
    this.context = context;
    this.calls = calls.map((c) => ({ ...c }));
    this.selected = this.calls[0]?.id;
  }

  select(id: string): void {
    this.call(id);
    this.selected = id;
  }

  /** Frank's opening words on a call: plan vs alternative, evidence, one question. */
  openCall(id: string, signal?: AbortSignal): AsyncIterable<string> {
    const call = this.call(id);
    this.selected = id;
    const ask = call.contradicted
      ? 'The code contradicts the plan here. Lead with that, citing the file.'
      : 'Point out anything the files show about it, citing the file.';
    const instruction =
      `Open call ${call.id}: "${call.title}". In at most three sentences: say what the plan chose and the realistic alternative. ${ask} ` +
      `Then ask the one question that would settle it. If the plan's choice is clearly fine, say so and don't ask.`;
    return this.turn(instruction, id, signal, { hiddenPrompt: true });
  }

  /**
   * The developer says something about the selected call (or in general, if
   * none is selected). Spoken, Frank keeps his answer short enough to hear.
   */
  ask(
    text: string,
    signal?: AbortSignal,
    opts: { spoken?: boolean } = {},
  ): AsyncIterable<string> {
    const call = this.selected
      ? this.calls.find((c) => c.id === this.selected)
      : undefined;
    const listen =
      call?.hinge && this.answers[call.id] === undefined ? `\n\n${listenFor(call)}` : '';
    const request = `${text}${opts.spoken ? `\n\n${SPOKEN}` : ''}${listen}`;
    return this.turn(request, this.selected, signal, { shown: text });
  }

  /** "What would you do?" for the selected call. */
  whatWouldYouDo(
    signal?: AbortSignal,
    opts: { spoken?: boolean; unsure?: boolean } = {},
  ): AsyncIterable<string> {
    const call = this.selected ? this.call(this.selected) : undefined;
    const answered = call ? this.answers[call.id] : undefined;
    const known =
      call?.hinge && answered !== undefined
        ? ` I said "${call.hinge.answers[answered]?.answer}" to "${call.hinge.question}".`
        : '';
    const unsure =
      call?.hinge && opts.unsure
        ? ` I don't know the answer to "${call.hinge.question}". Recommend the option that is easiest to change later.`
        : '';
    const text = call
      ? `What would you do about "${call.question}"?${known}${unsure} In at most three short sentences: name the option first, then the reason, then what would change your answer.`
      : 'What would you do? Give me a clear recommendation, the reason, and what would change your answer.';
    const request = opts.spoken ? `${text}\n\n${SPOKEN}` : text;
    return this.turn(request, this.selected, signal, { shown: 'What would you do?' });
  }

  /**
   * Chooses one of a call's options (1-based). Option 1 is the plan's own
   * choice, so it keeps the call; any other option changes it. Returns the
   * next call still to make, if any.
   */
  choose(id: string, option: number): string | undefined {
    const call = this.call(id);
    const chosen = call.options[option - 1];
    if (!chosen) throw new Error(`Call ${id} has no option ${option}.`);
    if (this.suggestion?.callId === id) this.suggestion = undefined;
    return option === 1
      ? this.decide(id, { verdict: 'keep' })
      : this.decide(id, { verdict: 'change', detail: chosen.instruction, option });
  }

  /** Answers a call's hinge (0-based answer index). Returns the option it leads to. */
  answer(id: string, answerIndex: number): number {
    const call = this.call(id);
    const answer = call.hinge?.answers[answerIndex];
    if (!answer) throw new Error(`Call ${id} has no answer ${answerIndex + 1}.`);
    this.answers[id] = answerIndex;
    return answer.option;
  }

  /** The call after (or before) `id` in the list, whether made or not. */
  neighbour(id: string, step: 1 | -1): string | undefined {
    const i = this.calls.findIndex((c) => c.id === id);
    return this.calls[i + step]?.id;
  }

  /** Records a call. Returns the next call still to make, if any. */
  decide(id: string, outcome: Outcome): string | undefined {
    const call = this.call(id);
    if (outcome.verdict === 'change' && !outcome.detail.trim()) {
      throw new Error('A change needs a detail: say what to do instead.');
    }
    call.outcome = outcome;
    // Prefer the next open call after this one, then any open call before it.
    const i = this.calls.indexOf(call);
    const next =
      this.calls.slice(i + 1).find((c) => !c.outcome) ??
      this.calls.find((c) => !c.outcome);
    this.selected = next?.id ?? id;
    return next?.id;
  }

  get progress(): { made: number; total: number } {
    return { made: this.calls.filter((c) => c.outcome).length, total: this.calls.length };
  }

  /** The note for the agent, built only from the calls actually made. */
  note(): string {
    return composeNote(this.calls);
  }

  /** The request a turn would send. Exposed for tests and debugging. */
  buildRequest(text: string, callId: string | undefined): BrainRequest {
    const state =
      `${renderContext(this.context)}\n\n` +
      (this.calls.length
        ? `Calls in this plan:\n${renderCalls(this.calls, callId)}`
        : 'No calls found in this plan.');
    const thread = this.turns.filter((t) => t.callId === callId);
    const messages: BrainRequest['messages'] = [{ role: 'user', content: state }];
    // Keep roles alternating: the state message is "user", so the thread must start with Frank.
    if (thread.length) messages.push({ role: 'assistant', content: 'Understood.' });
    for (const t of thread) {
      const role = t.role === 'user' ? 'user' : 'assistant';
      const last = messages[messages.length - 1]!;
      if (last.role === role) last.content += `\n\n${t.text}`;
      else messages.push({ role, content: t.text });
    }
    const last = messages[messages.length - 1]!;
    if (last.role === 'user') last.content += `\n\n${text}`;
    else messages.push({ role: 'user', content: text });
    return { system: FRANK_SYSTEM, messages };
  }

  private async *turn(
    text: string,
    callId: string | undefined,
    signal: AbortSignal | undefined,
    opts: { hiddenPrompt?: boolean; shown?: string } = {},
  ): AsyncIterable<string> {
    const request = this.buildRequest(text, callId);
    // Opening prompts are Frank's own instructions, not something the developer said.
    if (!opts.hiddenPrompt)
      this.turns.push(withCall({ role: 'user', text: opts.shown ?? text }, callId));
    let reply = '';
    try {
      for await (const chunk of this.brain.stream(request, signal)) {
        reply += chunk;
        yield chunk;
      }
    } finally {
      const { text: said, option, answer } = splitSuggestion(reply);
      if (said) this.turns.push(withCall({ role: 'frank', text: said }, callId));
      const call = callId ? this.calls.find((c) => c.id === callId) : undefined;
      if (call && option && option <= call.options.length) {
        this.suggestion = { callId: call.id, option };
      }
      this.heardAnswer =
        call?.hinge && answer && answer <= call.hinge.answers.length
          ? { callId: call.id, answer: answer - 1 }
          : undefined;
    }
  }

  private call(id: string): Call {
    const call = this.calls.find((c) => c.id === id);
    if (!call) throw new Error(`No call ${id} in this plan.`);
    return call;
  }
}

function withCall(turn: Turn, callId: string | undefined): Turn {
  return callId ? { ...turn, callId } : turn;
}

/**
 * Frank ends a reply with "[option N]" when he recommends an option, and
 * with "[answer N]" when the developer's words answered what the call comes
 * down to. Returns the reply without those lines, and what they said. Safe
 * on partial replies.
 */
export function splitSuggestion(reply: string): {
  text: string;
  option?: number;
  answer?: number;
} {
  let text = reply;
  let option: number | undefined;
  let answer: number | undefined;
  for (;;) {
    const m = /\s*\[(option|answer)\s+(\d)\]\s*$/i.exec(text);
    if (!m) break;
    if (m[1]!.toLowerCase() === 'option') option ??= Number(m[2]);
    else answer ??= Number(m[2]);
    text = text.slice(0, m.index);
  }
  // A tag still arriving: "[opt", "[answ".
  text = text.replace(/\s*\[(?:[oa][a-z]*(?:\s+\d?)?)?$/i, '').trim();
  return {
    text,
    ...(option !== undefined ? { option } : {}),
    ...(answer !== undefined ? { answer } : {}),
  };
}

/** Asks Frank to notice when the developer's words answer the call's deciding question. */
function listenFor(call: Call): string {
  const answers = call
    .hinge!.answers.map((a, i) => `${i + 1} = "${a.answer}"`)
    .join(', ');
  return `(If what I said answers "${call.hinge!.question}", end your reply with a line containing only [answer N], where ${answers}.)`;
}
