import { forget, SentryError } from '@sentry/utils';
import { app, protocol } from 'electron';

import { IPCChannel, PROTOCOL_SCHEME } from '../../common';
import { whenAppReady } from '../electron-normalize';
import { ElectronMainOptions } from '../sdk';
import { handleEvent, handleScope } from './common';

/** Enables Electron protocol handling */
export function configure(options: ElectronMainOptions): void {
  if (app.isReady()) {
    throw new SentryError("Sentry SDK should be initialized before the Electron app 'ready' event is fired");
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL_SCHEME,
      privileges: { bypassCSP: true, supportFetchAPI: true },
    },
  ]);

  forget(
    whenAppReady.then(() => {
      for (const sesh of options.getSessions()) {
        sesh.protocol.registerStringProtocol(PROTOCOL_SCHEME, (request, callback) => {
          const data = request.uploadData?.[0]?.bytes.toString();

          if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.EVENT}`) && data) {
            handleEvent(options, data);
          } else if (request.url.startsWith(`${PROTOCOL_SCHEME}://${IPCChannel.SCOPE}`) && data) {
            handleScope(options, data);
          }

          callback('');
        });
      }
    }),
  );
}
