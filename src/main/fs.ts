import { app } from 'electron';
import { mkdir, mkdirSync, readdir, readFile, rename, stat, statSync, unlink, writeFile } from 'fs';
import { dirname, join, resolve } from 'path';
import { promisify } from 'util';

export const sentryCachePath = join(app.getPath('userData'), 'sentry');

export const writeFileAsync = promisify(writeFile);
export const readFileAsync = promisify(readFile);
export const mkdirAsync = promisify(mkdir);
export const statAsync = promisify(stat);
export const unlinkAsync = promisify(unlink);
export const readDirAsync = promisify(readdir);
export const renameAsync = promisify(rename);

// mkdir/mkdirSync with recursive was only added in Node 10+

/**
 * Recursively creates the given path.
 *
 * @param path A relative or absolute path to create.
 * @returns A Promise that resolves when the path has been created.
 */
export async function mkdirp(path: string): Promise<void> {
  // eslint-disable-next-line no-bitwise
  const realPath = resolve(path);

  try {
    return mkdirAsync(realPath, 0o777);
  } catch (err) {
    const error = err as { code: string };
    if (error && error.code === 'ENOENT') {
      await mkdirp(dirname(realPath));
      return mkdirAsync(realPath, 0o777);
    }

    try {
      if (!statSync(realPath).isDirectory()) {
        throw err;
      }
    } catch (_) {
      throw err;
    }
  }
}

/**
 * Synchronous version of {@link mkdirp}.
 *
 * @param path A relative or absolute path to create.
 */
export function mkdirpSync(path: string): void {
  const realPath = resolve(path);

  try {
    mkdirSync(realPath, 0o777);
  } catch (err) {
    const error = err as { code: string };
    if (error && error.code === 'ENOENT') {
      mkdirpSync(dirname(realPath));
      mkdirSync(realPath, 0o777);
    } else {
      try {
        if (!statSync(realPath).isDirectory()) {
          throw err;
        }
      } catch (_) {
        throw err;
      }
    }
  }
}
