import { app } from 'electron';
import { mkdir, mkdirSync, readdir, readFile, rename, stat, Stats, statSync, unlink } from 'fs';
import { dirname, join, resolve } from 'path';

export const sentryCachePath = join(app.getPath('userData'), 'sentry');

/**
 * Asynchronously reads given files content.
 *
 * @param path A relative or absolute path to the file
 * @returns A Promise that resolves when the file has been read.
 */
export async function readFileAsync(
  path: string,
  options?: { encoding?: string; flag?: string },
): Promise<string | Buffer> {
  // We cannot use util.promisify here because that was only introduced in Node
  // 8 and we need to support older Node versions.
  return new Promise<string | Buffer>((res, reject) => {
    readFile(path, options as any, (err: any, data: any) => {
      if (err) {
        reject(err);
      } else {
        res(data);
      }
    });
  });
}

/**
 * Asynchronously creates the given directory.
 *
 * @param path A relative or absolute path to the directory.
 * @param mode The permission mode.
 * @returns A Promise that resolves when the path has been created.
 */
async function mkdirAsync(path: string, mode: number): Promise<void> {
  // We cannot use util.promisify here because that was only introduced in Node
  // 8 and we need to support older Node versions.
  return new Promise<void>((res, reject) => {
    mkdir(path, mode, (err) => {
      if (err) {
        reject(err);
      } else {
        res();
      }
    });
  });
}

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

/**
 * Read stats async
 */
export function statAsync(path: string): Promise<Stats> {
  return new Promise<Stats>((res, reject) => {
    stat(path, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      res(stats);
    });
  });
}

/**
 * unlink async
 */
export function unlinkAsync(path: string): Promise<void> {
  return new Promise<void>((res, reject) => {
    unlink(path, (err) => {
      if (err) {
        reject(err);
        return;
      }
      res();
    });
  });
}

/**
 * readdir async
 */
export function readDirAsync(path: string): Promise<string[]> {
  return new Promise<string[]>((res, reject) => {
    readdir(path, (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      res(files);
    });
  });
}

/**
 * rename async
 */
export function renameAsync(oldPath: string, newPath: string): Promise<void> {
  return new Promise<void>((res, reject) => {
    rename(oldPath, newPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      res();
    });
  });
}
