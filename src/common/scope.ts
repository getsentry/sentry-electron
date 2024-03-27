import { getCurrentScope, getIsolationScope, mergeScopeData } from '@sentry/core';
import { Scope, ScopeData } from '@sentry/types';

/** Gets the merged scope data */
export function getScopeData(): ScopeData {
  const scope = getIsolationScope().getScopeData();
  mergeScopeData(scope, getCurrentScope().getScopeData());
  scope.eventProcessors = [];
  return scope;
}

/** Hooks both current and isolation scope changes and passes merged scope on changes  */
export function addScopeListener(callback: (merged: ScopeData, current: Scope, isolation: Scope) => void): void {
  getIsolationScope().addScopeListener((isolation) => {
    const current = getCurrentScope();
    const merged = getScopeData();
    callback(merged, current, isolation);
  });
  getCurrentScope().addScopeListener((current) => {
    const isolation = getIsolationScope();
    const merged = getScopeData();
    callback(merged, current, isolation);
  });
}
