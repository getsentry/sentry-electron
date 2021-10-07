import { walk as walkUtil } from '@sentry/utils';

/** Walks an object to perform a normalization on it with a maximum depth of 50 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function walk(key: string, value: any): any {
  return walkUtil(key, value, 50);
}
