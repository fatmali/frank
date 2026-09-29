import { useEffect, useId, useState } from 'react';

const MAX_SOURCE_LENGTH = 4_000;
const ALLOWED_START = /^(?:flowchart\s+(?:TB|TD|BT|RL|LR)|sequenceDiagram)\b/;
const FORBIDDEN = /^\s*(?:click|href|linkStyle)\b|%%\s*\{init/imu;

type SketchState =
  | { status: 'drawing' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string };

let renderQueue = Promise.resolve();

export function sketchError(source: string): string | undefined {
  const trimmed = source.trim();
  if (!trimmed) return 'The sketch was empty.';
  if (trimmed.length > MAX_SOURCE_LENGTH) return 'The sketch was too large to draw.';
  if (!ALLOWED_START.test(trimmed)) {
    return 'Frank can draw flowcharts and sequence diagrams here.';
  }
  if (FORBIDDEN.test(trimmed)) return 'The sketch used an unsupported directive.';
  return undefined;
}

function color(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function draw(id: string, source: string): Promise<string> {
  const render = async () => {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: color('--font-ui'),
      flowchart: { htmlLabels: false, curve: 'linear' },
      themeVariables: {
        background: color('--surface'),
        primaryColor: color('--surface'),
        primaryTextColor: color('--ink'),
        primaryBorderColor: color('--ink'),
        secondaryColor: color('--duck'),
        secondaryTextColor: color('--ink'),
        secondaryBorderColor: color('--ink'),
        tertiaryColor: color('--surface-sunk'),
        tertiaryTextColor: color('--ink'),
        tertiaryBorderColor: color('--rule'),
        lineColor: color('--ink-muted'),
        textColor: color('--ink'),
        noteBkgColor: color('--duck'),
        noteTextColor: color('--ink'),
        noteBorderColor: color('--ink'),
      },
    });
    const result = await mermaid.render(id, source);
    return result.svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
  };
  const next = renderQueue.then(render, render);
  renderQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** A small local Mermaid diagram from Frank's explanation. */
export function FrankSketch({ source }: { source: string }) {
  const reactId = useId();
  const [state, setState] = useState<SketchState>({ status: 'drawing' });
  const error = sketchError(source);

  useEffect(() => {
    let current = true;
    if (error) {
      setState({ status: 'error', message: error });
      return () => {
        current = false;
      };
    }
    setState({ status: 'drawing' });
    const id = `frank-sketch-${reactId.replace(/[^a-z0-9_-]/gi, '')}`;
    void draw(id, source)
      .then((svg) => {
        if (current) setState({ status: 'ready', svg });
      })
      .catch((reason: unknown) => {
        if (current) {
          setState({
            status: 'error',
            message: `Frank couldn't draw this sketch: ${String(reason)}`,
          });
        }
      });
    return () => {
      current = false;
    };
  }, [error, reactId, source]);

  return (
    <figure
      className={`frank-sketch ${state.status}`}
      aria-label="Frank's sketch"
      aria-busy={state.status === 'drawing'}
    >
      <figcaption>
        <span>Frank's sketch</span>
        <span className="quiet">
          {state.status === 'drawing'
            ? 'drawing'
            : state.status === 'ready'
              ? 'local diagram'
              : 'source shown'}
        </span>
      </figcaption>
      {state.status === 'ready' && (
        <div
          className="frank-sketch-canvas"
          // Mermaid's strict mode sanitizes generated SVG and disables links.
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )}
      {state.status === 'drawing' && (
        <div className="frank-sketch-loading" role="status">
          Pulling the lines into place…
        </div>
      )}
      {state.status === 'error' && (
        <p className="frank-sketch-error" role="alert">
          {state.message}
        </p>
      )}
      <details className="frank-sketch-source">
        <summary>Diagram source</summary>
        <pre>{source.trim()}</pre>
      </details>
    </figure>
  );
}
