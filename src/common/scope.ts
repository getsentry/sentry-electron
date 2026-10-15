import type { Scope, ScopeData } from '@sentry/core';
import { getCurrentScope, getGlobalScope, getIsolationScope, mergeScopeData } from '@sentry/core';

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

/**
 * Calls back on any change to the global, isolation or current scope
 * without building the merged scope. Use this when the callback reads
 * the scope lazily, so bursts of changes cost nothing until it does.
 */
export function onScopeChange(callback: () => void): void {
  getGlobalScope().addScopeListener(callback);
  getIsolationScope().addScopeListener(callback);
  getCurrentScope().addScopeListener(callback);
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
