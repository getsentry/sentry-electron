import { Scope } from '@sentry/core';
import {
  Attachment,
  Breadcrumb,
  Contexts,
  EventProcessor,
  Extras,
  Primitive,
  PropagationContext,
  RequestSession,
  Scope as ScopeInterface,
  Session,
  Severity,
  SeverityLevel,
  Span,
  User,
} from '@sentry/types';

export interface ScopeInternal {
  _notifyingListeners: boolean;
  _scopeListeners: Array<(scope: ScopeInterface) => void>;
  _eventProcessors: EventProcessor[];
  _breadcrumbs: Breadcrumb[];
  _user: User;
  _tags: { [key: string]: Primitive };
  _extra: Extras;
  _contexts: Contexts;
  _attachments: Attachment[];
  _propagationContext: PropagationContext;
  _sdkProcessingMetadata: { [key: string]: unknown };
  _fingerprint?: string[];
  // eslint-disable-next-line deprecation/deprecation
  _level?: Severity | SeverityLevel;
  _transactionName?: string;
  _span?: Span;
  _session?: Session;
  _requestSession?: RequestSession;
}

/**
 * Rehydrates scope from a JSON object
 */
export function scopeFromJson(scope: ScopeInternal): Scope {
  const newScope = new Scope();
  Object.assign(newScope, scope);
  return newScope;
}
