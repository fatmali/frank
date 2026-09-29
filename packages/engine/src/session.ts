import { FRANK_SYSTEM, renderCalls, renderContext } from './prompt.ts';
import { composeNote } from './note.ts';
import type { Brain, BrainRequest, Call, Context, Outcome, Turn } from './types.ts';

/**
 * One talk-through: the developer and Frank going over a plan's calls, one at
 * a time. Every turn sends compact state (context, all calls with outcomes,
 * and only the current call's thread) rather than the whole transcript.
 */
export class Session {
  readonly context: Context;
  readonly calls: Call[];
  readonly turns: Turn[] = [];
  selected: string | undefined;

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

  /** The developer says something about the selected call (or in general, if none is selected). */
  ask(text: string, signal?: AbortSignal): AsyncIterable<string> {
    return this.turn(text, this.selected, signal);
  }

  /** "What would you do?" for the selected call. */
  whatWouldYouDo(signal?: AbortSignal): AsyncIterable<string> {
    const call = this.selected ? this.call(this.selected) : undefined;
    const text = call
      ? `What would you do about "${call.title}"? Give me a clear recommendation, the reason, and what would change your answer.`
      : 'What would you do? Give me a clear recommendation, the reason, and what would change your answer.';
    return this.turn(text, this.selected, signal, { shown: 'What would you do?' });
  }

  /** Records a call. Returns the next call still to make, if any. */
  decide(id: string, outcome: Outcome): string | undefined {
    const call = this.call(id);
    if (outcome.verdict === 'change' && !outcome.detail.trim()) {
      throw new Error('A change needs a detail: say what to do instead.');
    }
    call.outcome = outcome;
    const next = this.calls.find((c) => !c.outcome);
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
      if (reply.trim())
        this.turns.push(withCall({ role: 'frank', text: reply.trim() }, callId));
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
