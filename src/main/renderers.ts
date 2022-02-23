import { app } from 'electron';

import { normalizeUrl } from '../common';
import { onWebContentsCreated } from './electron-normalize';

interface Renderer {
  id: number;
  url?: string;
  title?: string;
}

let RENDERERS: Map<number, Renderer> | undefined;

/**
 * Enable tracking of renderer properties via events
 *
 * This allows us to get the last known state of a renderer even if it's been destroyed
 **/
export function trackRendererProperties(): void {
  if (RENDERERS) {
    return;
  }

  const renderers = (RENDERERS = new Map<number, Renderer>());

  function updateUrl(id: number, url: string): void {
    const state = renderers.get(id) || { id };
    state.url = normalizeUrl(url, app.getAppPath());
    renderers.set(id, state);
  }

  function updateTitle(id: number, title: string): void {
    const state = renderers.get(id) || { id };
    state.title = title;
    renderers.set(id, state);
  }

  onWebContentsCreated((contents) => {
    const id = contents.id;

    contents.on('did-navigate', (_, url) => updateUrl(id, url));
    contents.on('did-navigate-in-page', (_, url) => updateUrl(id, url));
    contents.on('page-title-updated', (_, title) => updateTitle(id, title));

    contents.on('destroyed', () => {
      // We need to delay since consumers of this API sometimes need to
      // access the state shortly after a renderer is destroyed
      setTimeout(() => {
        renderers.delete(id);
      }, 5000);
    });
  });
}

/** Gets the properties for a renderer */
export function getRendererProperties(id: number): Renderer | undefined {
  return RENDERERS?.get(id);
}
