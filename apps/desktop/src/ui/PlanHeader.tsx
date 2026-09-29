import { agentName } from '@frank/engine';
import { DuckMark } from '../DuckMark.tsx';
import { MOD, planMeta } from '../format.ts';
import { Kbd } from './Kbd.tsx';
import { useController, usePanel } from './store.ts';

export function PlanHeader() {
  const c = useController();
  const { plan, noteCopied, newerPlan, view } = usePanel();
  const home = view.name === 'plans';
  return (
    <header className="plan-header">
      <DuckMark size={20} className={noteCopied ? 'duck nod' : 'duck'} />
      {home ? (
        <div className="plan-title">
          <span className="title">Your plans</span>
          <span className="meta">From the last two weeks, newest first</span>
        </div>
      ) : (
        <button
          className="plan-title"
          onClick={() => void c.showPlans()}
          aria-label={plan ? `Plan: ${plan.title}. All plans` : 'All plans'}
        >
          <span className="title">{plan?.title ?? 'Frank'}</span>
          <span className="meta">{plan ? planMeta(plan) : 'No plan yet'}</span>
        </button>
      )}
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
