import { expect } from 'chai';

import { walkSync } from './e2e/utils';

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function expectFilesInDirectory(dir: string, count: number): Promise<void> {
  const found = Array.from(walkSync(dir)).length;
  expect(found, 'files in directory').to.equal(count);
}
