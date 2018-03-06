/** A child process descriptor. */
interface ProcessChild {
  /** The parent process ID. */
  ppid: number;
  /** The process ID of the child. */
  pid: number;
  /** The name of the process. */
  name: string;
  /** Recrusive children of that process */
  children: ProcessChild[];
}

/**
 * Recursively determines the hierarchy of child processes.
 *
 * @param pid The process ID of the root process.
 * @param callback A callback that will receive child processes.
 */
declare function pTree(
  pid: number,
  callback: (error: Error, children: ProcessChild[]) => void,
): string;

declare module 'process-tree' {
  export = pTree;
}
