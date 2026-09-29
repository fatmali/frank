import '@fontsource/monaspace-neon/latin-400.css';
import '@fontsource/monaspace-neon/latin-600.css';
import '@fontsource/monaspace-radon/latin-400.css';
import './styles/tokens.css';
import './styles/panel.css';
import { createRoot } from 'react-dom/client';
import { PanelController } from './controller.ts';
import { BrainFailure, type Host } from './host.ts';
import { Panel } from './ui/Panel.tsx';
import { Sticky } from './ui/Sticky.tsx';

const params = new URLSearchParams(location.search);
const inTauri = '__TAURI_INTERNALS__' in window;
const root = createRoot(document.getElementById('root')!);

async function main() {
  if (params.get('view') === 'sticky') {
    document.documentElement.classList.add('sticky-window');
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    root.render(
      <Sticky
        onClick={() => void invoke('toggle_panel_from_sticky')}
        onDrag={() => {
          void invoke('sticky_drag_started');
          void getCurrentWindow().startDragging();
        }}
        subscribe={(handler) =>
          void listen<string>('mood', (e) => handler(e.payload as never))
        }
      />,
    );
    return;
  }

  if (inTauri) {
    const host = (await import('./tauri-host.ts')).tauriHost;
    root.render(<Panel controller={new PanelController(host)} />);
    return;
  }

  // In a browser: the demo, with a pretend brain and microphone (`pnpm demo`).
  document.documentElement.classList.add('demo');
  const { demoHost } = await import('./demo.ts');
  const { DemoPage } = await import('./DemoPage.tsx');
  let nextLine: string | undefined;
  const render = (controller: PanelController) =>
    root.render(
      <DemoPage controller={controller} nextLine={nextLine} onRestart={restart} />,
    );
  let controller: PanelController;
  function restart() {
    const host: Host = demoHost({
      live: true,
      firstRun: params.has('first-run'),
      voiceModel: params.get('voice-model') !== 'no',
      naturalVoices: params.has('natural-voices'),
      onNextUtterance: (next) => {
        nextLine = next;
        if (controller) render(controller);
      },
      ...(params.has('no-plan') ? { plans: [] } : {}),
      ...(params.has('signed-out')
        ? {
            failure: new BrainFailure(
              'not-ready',
              "Claude Code isn't signed in. Open it, log in, then press Retry.",
            ),
          }
        : {}),
    });
    controller = new PanelController(host);
    root.render(null);
    render(controller);
  }
  restart();
}

void main();
