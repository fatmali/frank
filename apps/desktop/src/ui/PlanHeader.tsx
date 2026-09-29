import { agentName } from '@frank/engine';
import { DuckMark } from '../DuckMark.tsx';
import { MOD, planMeta } from '../format.ts';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

export function PlanHeader() {
  const c = useController();
  const { plan, noteCopied, newerPlan, pickerOpen } = usePanel();
  return (
    <header className="plan-header">
      <DuckMark size={20} className={noteCopied ? 'duck nod' : 'duck'} />
      <button
        className="plan-title"
        onClick={() => c.togglePicker()}
        aria-expanded={pickerOpen}
        aria-label={plan ? `Plan: ${plan.title}. Switch plan` : 'Choose a plan'}
      >
        <span className="title">{plan?.title ?? 'Frank'}</span>
        <span className="meta">{plan ? planMeta(plan) : 'No plan yet'}</span>
      </button>
      <Kbd>{`${MOD}P`}</Kbd>
      {newerPlan && (
        <div className="newer" role="status">
          <span>A newer plan from {agentName(newerPlan.source)}. Switch?</span>
          <button className="text-button" onClick={() => void c.switchToNewer()}>
            Switch <Kbd>↵</Kbd>
          </button>
        </div>
      )}
    </header>
  );
}

/** ⌘P: recent plans, or paste one. */
export function PlanPicker() {
  const c = useController();
  const { plans, plan } = usePanel();
  return (
    <div className="picker" role="dialog" aria-label="Switch plan">
      {plans.length > 0 ? (
        <ul className="picker-list">
          {plans.map((p) => (
            <li key={p.origin + p.modifiedAt}>
              <button
                className="picker-item"
                aria-current={
                  p.origin === plan?.origin && p.modifiedAt === plan?.modifiedAt
                }
                onClick={() => void c.load(p)}
              >
                <span className="title">{p.title}</span>
                <span className="meta">{planMeta(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet">No recent plans from Claude Code.</p>
      )}
      <p className="picker-foot">
        <span>Paste a plan with {MOD}V, or drop a file here.</span>
        <button className="text-button" onClick={() => c.openSettings()}>
          Settings <Kbd>{`${MOD},`}</Kbd>
        </button>
      </p>
    </div>
  );
}
