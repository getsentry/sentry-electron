import { Integration } from '@sentry/types';

import { endSessionOnExit, startSession } from '../sessions';

interface Options {
  /**
   * Whether sessions should be sent immediately on creation
   *
   * @default false
   */
  sendOnCreate?: boolean;
}

/** Tracks sessions as the main process lifetime. */
export class MainProcessSession implements Integration {
  /** @inheritDoc */
  public static id: string = 'MainProcessSession';

  /** @inheritDoc */
  public readonly name: string;

  public constructor(private readonly _options: Options = {}) {
    this.name = MainProcessSession.id;
  }

  /** @inheritDoc */
  public setupOnce(): void {
    void startSession(!!this._options.sendOnCreate);

    endSessionOnExit();
  }
}
