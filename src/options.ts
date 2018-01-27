import { app as appMain, BrowserWindow, crashReporter, ipcMain, ipcRenderer, remote, webContents } from 'electron';
const app = process.type === 'renderer' ? remote.app : appMain;
const mainProcess = process.type === 'renderer' ? remote.process : process;

export interface IElectronSentryOptions {
  dsn?: string;
  native?: boolean;
  release?: string;
  appName?: string;
  companyName?: string;
  environment?: string;
  tags?: any;
}

export const defaults: IElectronSentryOptions = {
  dsn: undefined,
  appName: app.getName(),
  companyName: app.getName(),
  native: true,
  release: app.getVersion(),
  environment: mainProcess.defaultApp == undefined ? 'production' : 'development',
  tags: undefined
};
