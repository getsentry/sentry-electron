import { getCurrentScope, getGlobalScope,getIsolationScope, mergeScopeData } from '@sentry/core';
import { Scope, ScopeData } from '@sentry/types';

/** Gets the merged scope data */
export function getScopeData(): ScopeData {
  const globalScope = getGlobalScope().getScopeData();
  const isolationScope = getIsolationScope().getScopeData();
  const currentScope = getCurrentScope().getScopeData();
  mergeScopeData(globalScope, isolationScope);
  mergeScopeData(globalScope, currentScope);
  globalScope.eventProcessors = [];
  return globalScope;
}

/** Hooks both current and isolation scope changes and passes merged scope on changes  */
export function addScopeListener(callback: (merged: ScopeData, changed: Scope) => void): void {
  getIsolationScope().addScopeListener((isolation) => {
    const merged = getScopeData();
    callback(merged, isolation);
  });
  getCurrentScope().addScopeListener((current) => {
    const merged = getScopeData();
    callback(merged, current);
  });
  getGlobalScope().addScopeListener((global) => {
    const merged = getScopeData();
    callback(merged, global);
  });
}
