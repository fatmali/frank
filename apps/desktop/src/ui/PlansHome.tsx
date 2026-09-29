import { planKey, type Visit } from '../controller.ts';
import { MOD, planMeta } from '../format.ts';
import { useController, usePanel } from './store.ts';

/**
 * The plans home: every plan from the last two weeks, newest first, with
 * how far each got. Pick one by clicking, by number, or by saying it.
 */
export function PlansHome() {
  const c = useController();
  const { history, visits, plan: open } = usePanel();
  return (
    <section className="plans-home" aria-label="Your plans">
      <ol className="plan-list">
        {history.map((p, i) => {
          const key = planKey(p);
          const current = open !== undefined && planKey(open) === key;
          return (
            <li key={key}>
              <button
                className="plan-row"
                aria-current={current || undefined}
                onClick={() => void c.load(p)}
              >
                <span className="plan-number" aria-hidden="true">
                  {i < 9 ? i + 1 : ''}
                </span>
                <span className="plan-row-title">{p.title}</span>
                <span className="plan-row-status">{status(visits[key], current)}</span>
                <span className="plan-row-meta">{planMeta(p)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="quiet plans-foot">
        Or paste a plan with {MOD}V, or drop a file here.
      </p>
    </section>
  );
}

/** How far a plan got, in a few words. Nothing for one you haven't opened. */
function status(visit: Visit | undefined, current: boolean): string {
  if (!visit) return current ? 'open now' : '';
  if (visit.copied) return 'note copied';
  if (visit.total === 0) return 'nothing needed you';
  if (visit.made === visit.total) return 'all decided';
  if (visit.made === 0) return current ? 'open now' : 'read';
  return `${visit.made} of ${visit.total} decided`;
}
