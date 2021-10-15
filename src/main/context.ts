/* eslint-disable max-lines */
import { Event, SdkInfo } from '@sentry/types';
import * as child from 'child_process';
import { app } from 'electron';
import { platform, release } from 'os';
import { join } from 'path';

import { readDirAsync, readFileAsync } from './fs';
import { SDK_VERSION } from './version';

export const SDK_NAME = 'sentry.javascript.electron';

/** Operating system context information. */
interface OsContext {
  /** The name of the operating system. */
  name?: string;
  /** The operating system version. */
  version?: string;
  /** Operating system specific build identifier */
  build?: string;
  /** Version-independent kernel version. */
  kernel_version?: string;
}

/** Linux version file to check for a distribution. */
interface DistroFile {
  /** The file name, located in `/etc`. */
  name: string;
  /** Potential distributions to check. */
  distros: string[];
}

/** Mapping of Node's platform names to actual OS names. */
const PLATFORM_NAMES: { [platform: string]: string } = {
  aix: 'IBM AIX',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
  sunos: 'SunOS',
  win32: 'Windows',
};

/** Mapping of linux release files located in /etc to distributions. */
const LINUX_DISTROS: DistroFile[] = [
  { name: 'fedora-release', distros: ['Fedora'] },
  { name: 'redhat-release', distros: ['Red Hat Linux', 'Centos'] },
  { name: 'redhat_version', distros: ['Red Hat Linux'] },
  { name: 'SuSE-release', distros: ['SUSE Linux'] },
  { name: 'lsb-release', distros: ['Ubuntu Linux', 'Arch Linux'] },
  { name: 'debian_version', distros: ['Debian'] },
  { name: 'debian_release', distros: ['Debian'] },
  { name: 'arch-release', distros: ['Arch Linux'] },
  { name: 'gentoo-release', distros: ['Gentoo Linux'] },
  { name: 'novell-release', distros: ['SUSE Linux'] },
  { name: 'alpine-release', distros: ['Alpine Linux'] },
];

/** Functions to extract the OS version from Linux release files. */
const LINUX_VERSIONS: {
  [identifier: string]: (content: string) => string | undefined;
} = {
  alpine: (content) => content,
  arch: (content) => matchFirst(/distrib_release=(.*)/, content),
  centos: (content) => matchFirst(/release ([^ ]+)/, content),
  debian: (content) => content,
  fedora: (content) => matchFirst(/release (..)/, content),
  mint: (content) => matchFirst(/distrib_release=(.*)/, content),
  red: (content) => matchFirst(/release ([^ ]+)/, content),
  suse: (content) => matchFirst(/VERSION = (.*)\n/, content),
  ubuntu: (content) => matchFirst(/distrib_release=(.*)/, content),
};

/** Cached event prototype with default values. */
let defaultsPromise: Promise<Event>;

/**
 * Executes a regular expression with one capture group.
 *
 * @param regex A regular expression to execute.
 * @param text Content to execute the RegEx on.
 * @returns The captured string if matched; otherwise undefined.
 */
function matchFirst(regex: RegExp, text: string): string | undefined {
  const match = regex.exec(text);
  return match ? match[1] : undefined;
}

/** Returns the build type of this app, if possible. */
function getBuildType(): string | undefined {
  if (process.mas) {
    return 'app-store';
  }

  if (process.windowsStore) {
    return 'windows-store';
  }

  return undefined;
}

/** Loads the macOS operating system context. */
async function getDarwinInfo(): Promise<OsContext> {
  // Default values that will be used in case no operating system information
  // can be loaded. The default version is computed via heuristics from the
  // kernel version, but the build ID is missing.
  const darwinInfo: OsContext = {
    kernel_version: release(),
    name: 'Mac OS X',
    version: `10.${Number(release().split('.')[0]) - 4}`,
  };

  try {
    // We try to load the actual macOS version by executing the `sw_vers` tool.
    // This tool should be available on every standard macOS installation. In
    // case this fails, we stick with the values computed above.

    const output = await new Promise<string>((resolve, reject) => {
      child.execFile('/usr/bin/sw_vers', (error: Error | null, stdout: string) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
    darwinInfo.name = matchFirst(/^ProductName:\s+(.*)$/m, output);
    darwinInfo.version = matchFirst(/^ProductVersion:\s+(.*)$/m, output);
    darwinInfo.build = matchFirst(/^BuildVersion:\s+(.*)$/m, output);
  } catch (e) {
    // ignore
  }

  return darwinInfo;
}

/** Returns a distribution identifier to look up version callbacks. */
function getLinuxDistroId(name: string): string {
  return name.split(' ')[0].toLowerCase();
}

/** Loads the Linux operating system context. */
async function getLinuxInfo(): Promise<OsContext> {
  // By default, we cannot assume anything about the distribution or Linux
  // version. `os.release()` returns the kernel version and we assume a generic
  // "Linux" name, which will be replaced down below.
  const linuxInfo: OsContext = {
    kernel_version: release(),
    name: 'Linux',
  };

  try {
    // We start guessing the distribution by listing files in the /etc
    // directory. This is were most Linux distributions (except Knoppix) store
    // release files with certain distribution-dependent meta data. We search
    // for exactly one known file defined in `LINUX_DISTROS` and exit if none
    // are found. In case there are more than one file, we just stick with the
    // first one.
    const etcFiles = await readDirAsync('/etc');
    const distroFile = LINUX_DISTROS.find((file) => etcFiles.includes(file.name));
    if (!distroFile) {
      return linuxInfo;
    }

    // Once that file is known, load its contents. To make searching in those
    // files easier, we lowercase the file contents. Since these files are
    // usually quite small, this should not allocate too much memory and we only
    // hold on to it for a very short amount of time.
    const distroPath = join('/etc', distroFile.name);
    const contents = ((await readFileAsync(distroPath, { encoding: 'utf-8' })) as string).toLowerCase();

    // Some Linux distributions store their release information in the same file
    // (e.g. RHEL and Centos). In those cases, we scan the file for an
    // identifier, that basically consists of the first word of the linux
    // distribution name (e.g. "red" for Red Hat). In case there is no match, we
    // just assume the first distribution in our list.
    const { distros } = distroFile;
    linuxInfo.name = distros.find((d) => contents.indexOf(getLinuxDistroId(d)) >= 0) || distros[0];

    // Based on the found distribution, we can now compute the actual version
    // number. This is different for every distribution, so several strategies
    // are computed in `LINUX_VERSIONS`.
    const id = getLinuxDistroId(linuxInfo.name);
    linuxInfo.version = LINUX_VERSIONS[id](contents);
  } catch (e) {
    // ignore
  }

  return linuxInfo;
}

/**
 * Returns the operating system context.
 *
 * Based on the current platform, this uses a different strategy to provide the
 * most accurate OS information. Since this might involve spawning subprocesses
 * or accessing the file system, this should only be executed lazily and cached.
 *
 *  - On macOS (Darwin), this will execute the `sw_vers` utility. The context
 *    has a `name`, `version`, `build` and `kernel_version` set.
 *  - On Linux, this will try to load a distribution release from `/etc` and set
 *    the `name`, `version` and `kernel_version` fields.
 *  - On all other platforms, only a `name` and `version` will be returned. Note
 *    that `version` might actually be the kernel version.
 */
async function getOsContext(): Promise<OsContext> {
  const platformId = platform();
  switch (platformId) {
    case 'darwin':
      return getDarwinInfo();
    case 'linux':
      return getLinuxInfo();
    default:
      return {
        name: PLATFORM_NAMES[platformId] || platformId,
        version: release(),
      };
  }
}

/** Gets SDK info */
export function getSdkInfo(): SdkInfo {
  return {
    name: SDK_NAME,
    packages: [
      {
        name: 'npm:@sentry/electron',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };
}

/**
 * Computes Electron-specific default fields for events.
 *
 * The event defaults include contexts for the Electron, Node and Chrome
 * runtimes, limited device information, operating system context and defaults
 * for the release and environment.
 */
async function _getEventDefaults(release?: string): Promise<Event> {
  const app_name = app.name || app.getName();

  return {
    sdk: getSdkInfo(),
    contexts: {
      app: {
        app_name,
        app_version: app.getVersion(),
        build_type: getBuildType(),
      },
      browser: {
        name: 'Chrome',
      },
      chrome: {
        name: 'Chrome',
        type: 'runtime',
        version: process.versions.chrome,
      },
      device: {
        arch: process.arch,
        family: 'Desktop',
      },
      node: {
        name: 'Node',
        type: 'runtime',
        version: process.versions.node,
      },
      os: (await getOsContext()) as Record<string, string>,
      runtime: {
        name: 'Electron',
        version: process.versions.electron,
      },
      electron: {
        crashed_process: 'browser',
      },
    },
    environment: process.defaultApp ? 'development' : 'production',
    release: release || `${app_name.replace(/\W/g, '-')}@${app.getVersion()}`,
    user: { ip_address: '{{auto}}' },
    tags: {
      'event.origin': 'electron',
      'event.environment': 'javascript',
      // Legacy way of filtering native vs JavaScript events
      event_type: 'javascript',
    },
  };
}

/**
 * Computes and caches Electron-specific default fields for events.
 *
 * The event defaults include contexts for the Electron, Node and Chrome
 * runtimes, limited device information, operating system context and defaults
 * for the release and environment.
 */
export async function getEventDefaults(release?: string): Promise<Event> {
  // The event defaults are cached as long as the app is running. We create the
  // promise here synchronously to avoid multiple events computing them at the
  // same time.
  if (!defaultsPromise) {
    defaultsPromise = _getEventDefaults(release);
  }

  return await defaultsPromise;
}
