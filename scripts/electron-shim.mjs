import { register } from 'node:module';

const electronShim = Buffer.from(`
  export const app = { getAppPath: () => '' };
  export const autoUpdater = '';
  export const BrowserView = '';
  export const BrowserWindow = '';
  export const clipboard = '';
  export const contentTracing = '';
  export const crashReporter = '';
  export const desktopCapturer = '';
  export const dialog = '';
  export const globalShortcut = '';
  export const inAppPurchase = '';
  export const ipcMain = '';
  export const Menu = '';
  export const MessageChannelMain = '';
  export const MessagePortMain = '';
  export const nativeImage = '';
  export const nativeTheme = '';
  export const net = '';
  export const netLog = '';
  export const Notification = '';
  export const parentPort = '';
  export const powerMonitor = '';
  export const powerSaveBlocker = '';
  export const process = '';
  export const protocol = '';
  export const pushNotifications = '';
  export const safeStorage = '';
  export const screen = '';
  export const session = '';
  export const ShareMenu = '';
  export const shell = '';
  export const systemPreferences = '';
  export const TouchBar = '';
  export const Tray = '';
  export const utilityProcess = '';
  export const webContents = '';
  export const webFrameMain = '';
  `);

const hookScript = Buffer.from(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'electron') {
      return {
        shortCircuit: true,
        url: 'data:application/javascript;base64,${electronShim.toString('base64')}',
      };
    }

    return nextResolve(specifier);
  }
  `);

process.versions.electron = '29.1.0';

register(new URL(`data:application/javascript;base64,${hookScript.toString('base64')}`), import.meta.url);
