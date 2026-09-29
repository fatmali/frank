import { createContext, useContext, useSyncExternalStore } from 'react';
import type { PanelController, PanelState } from '../controller.ts';

export const ControllerContext = createContext<PanelController | null>(null);

export function useController(): PanelController {
  const c = useContext(ControllerContext);
  if (!c) throw new Error('No PanelController');
  return c;
}

export function usePanel(): PanelState {
  const c = useController();
  return useSyncExternalStore(c.subscribe, c.getSnapshot);
}
