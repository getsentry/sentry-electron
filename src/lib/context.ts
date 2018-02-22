import * as path from 'path';
import * as fs from 'fs';
import { remote, app } from 'electron';

import {
  Context
} from '@sentry/core';

import { SentryElectron } from './electron'

export interface UpdateContext {
  (prevContext: Context): Context;
}


export class ElectronContext {
  private data: Context = {};
  private contextPath: string;

  constructor() {
    const userDataPath = (app || remote.app).getPath('userData');
    const sentryPath = path.join(userDataPath, 'sentry');
    if (!fs.existsSync(sentryPath)) {
      fs.mkdirSync(sentryPath);
    }
    const contextPath = path.join(sentryPath, 'context');
    if (!fs.existsSync(contextPath)) {
      fs.mkdirSync(contextPath);
    }

    this.contextPath = path.join(contextPath, 'context.json');
    if (!fs.existsSync(this.contextPath)) {
      fs.writeFileSync(this.contextPath, JSON.stringify({}));
    }
  }

  public set(nextContext: Context | UpdateContext): Context {
    const prevContext = this.get();

    if (typeof nextContext === 'function') {
      this.data = Object.assign({}, prevContext, nextContext(this.get()));
    } else {
      this.data = Object.assign({}, prevContext, nextContext);
    }

    fs.writeFileSync(this.contextPath, JSON.stringify(this.data));
    return this.data;
  }

  public get(): Context {
    // Create an exact copy without references so people won't shoot themselves in the foot
    return JSON.parse(fs.readFileSync(this.contextPath).toString());
  }
}
