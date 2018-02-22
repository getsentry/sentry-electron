
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { remote, app } from 'electron';

import {
  Breadcrumb
} from '@sentry/core';

import { SentryElectron } from './electron'

export class BreadcrumbStore {
  public maxBreadcrumbs = 100;
  private breadcrumbs: Breadcrumb[] = [];
  private storagePath: string;
  private currentFileCounter = 0;

  constructor(private sentryElectron: SentryElectron) {
    this.maxBreadcrumbs = sentryElectron.options.maxBreadcrumbs || 100;
    const userDataPath = (app || remote.app).getPath('userData');
    const sentryPath = path.join(userDataPath, 'sentry');
    if (!fs.existsSync(sentryPath)) {
      fs.mkdirSync(sentryPath);
    }
    this.storagePath = path.join(sentryPath, 'breadcrumbs');
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath);
    }
  }

  private readDir(): string[] {
    const files = fs.readdirSync(this.storagePath);
    let breadcrumbFilePaths: string[] = [];
    files.forEach(file => {
      if (file.match('.DS_Store')) {
        return;
      }
      breadcrumbFilePaths.push(path.join(this.storagePath, file));
    });
    return breadcrumbFilePaths;
  }

  private readAllBreadcrumbs() {
    const breadcrumbFiles = this.readDir();
    let breadcrumbs: Breadcrumb[] = [];
    breadcrumbFiles.forEach(filename => {
      breadcrumbs.push(JSON.parse(fs.readFileSync(filename).toString()));
    });
    return breadcrumbs;
  }

  private uniqueAcendingJsonName() {
    return `${new Date().getTime()}-${this.currentFileCounter++}-${crypto.randomBytes(48).toString('hex')}.json`;
  }

  private handleLimit(maxCount = 100) {
    const breadcrumbFiles = this.readDir();
    const numberOfFilesToRemove = breadcrumbFiles.length - maxCount;
    console.log(numberOfFilesToRemove);
    for (let i = 0; i < numberOfFilesToRemove; i++) {
      fs.unlinkSync(breadcrumbFiles[i]);
    }
  }

  public addBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
    const stringifyedCrumb = JSON.stringify(breadcrumb);
    const crumb = JSON.parse(stringifyedCrumb);

    fs.writeFileSync(path.join(this.storagePath, this.uniqueAcendingJsonName()), stringifyedCrumb);

    this.handleLimit(this.maxBreadcrumbs);
    return crumb;
  }

  public getBreadcrumbs(): Breadcrumb[] {
    return this.readAllBreadcrumbs();
  }

  public count(): Number {
    return this.getBreadcrumbs().length;
  }
}
