/**
 * Creates a temporary directory.
 *
 * The callback will be provided with the directory and an optional cleanup
 * function. If something goes wrong, the first error argument is set.
 *
 * @param callback A callback that receives the path and a cleanup function.
 */
declare function tmpdir(
  callback: (error: Error, dir: string, cleanup: () => void) => void,
): void;

declare module 'temporary-directory' {
  export = tmpdir;
}
