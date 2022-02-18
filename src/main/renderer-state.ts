import { app } from 'electron';

import { normalizeUrl } from '../common';
import { onWebContentsCreated } from './electron-normalize';

interface RendererState {
  id?: number;
  url?: string;
  title?: string;
}

let RENDERER_STATES: Map<number, RendererState> | undefined;

function updateUrl(id: number, url: string): void {
  if (RENDERER_STATES) {
    const state = RENDERER_STATES.get(id) || { id };
    state.url = normalizeUrl(url, app.getAppPath());
    RENDERER_STATES.set(id, state);
  }
}

function updateTitle(id: number, title: string): void {
  if (RENDERER_STATES) {
    const state = RENDERER_STATES.get(id) || { id };
    state.title = title;
    RENDERER_STATES.set(id, state);
  }
}

/** Enable tracking of renderer states on change events */
export function trackRendererStates(): void {
  if (RENDERER_STATES) {
    return;
  } else {
    RENDERER_STATES = new Map<number, RendererState>();
  }

  onWebContentsCreated((contents) => {
    const id = contents.id;

    contents.on('did-navigate', (_, url) => updateUrl(id, url));
    contents.on('did-navigate-in-page', (_, url) => updateUrl(id, url));
    contents.on('page-title-updated', (_, title) => updateTitle(id, title));

    contents.on('destroyed', () => {
      // We need to delay since consumers of this API might need to
      // access the state shortly after a renderer is destroyed
      setTimeout(() => {
        if (RENDERER_STATES) {
          RENDERER_STATES.delete(id);
        }
      }, 5000);
    });
  });
}

/** Gets the state for a renderer */
export function getRendererState(id: number): RendererState | undefined {
  return RENDERER_STATES?.get(id);
}
