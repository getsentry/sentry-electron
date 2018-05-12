import * as child from 'child_process';
import * as fs from 'fs';
import { platform, release } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import { SentryEvent } from '@sentry/shim';
// tslint:disable-next-line:no-implicit-dependencies
import { app } from 'electron';

const execFile = promisify(child.execFile);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);

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

/** Shim interface to access this app's package.json. */
interface PackageJson {
  name: string;
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
  alpine: content => content,
  arch: content => matchFirst(/distrib_release=(.*)/, content),
  centos: content => matchFirst(/release ([^ ]+)/, content),
  debian: content => content,
  fedora: content => matchFirst(/release (..)/, content),
  mint: content => matchFirst(/distrib_release=(.*)/, content),
  red: content => matchFirst(/release ([^ ]+)/, content),
  suse: content => matchFirst(/VERSION = (.*)\n/, content),
  ubuntu: content => matchFirst(/distrib_release=(.*)/, content),
};

/** Cached event prototype with default values. */
let defaultsPromise: Promise<SentryEvent>;

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

/** Synchronously loads this app's package.json or throws if not possible. */
function getPackageJson(): PackageJson {
  const packagePath = join(app.getAppPath(), 'package.json');
  return module.require(packagePath) as PackageJson;
}

/** Returns the build type of this app, if possible. */
function getBuildType(): string | undefined {
  if (process.mas) {
    return 'app-store';
  } else if (process.windowsStore) {
    return 'windows-store';
  } else {
    return undefined;
  }
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
    const output = (await execFile('/usr/bin/sw_vers')).toString();
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
    const etcFiles = await readdir('/etc');
    const distroFile = LINUX_DISTROS.find(file => etcFiles.includes(file.name));
    if (!distroFile) {
      return linuxInfo;
    }

    // Once that file is known, load its contents. To make searching in those
    // files easier, we lowercase the file contents. Since these files are
    // usually quite small, this should not allocate too much memory and we only
    // hold on to it for a very short amount of time.
    const distroPath = join('/etc', distroFile.name);
    const contents = (await readFile(distroPath, 'utf-8')).toLowerCase();

    // Some Linux distributions store their release information in the same file
    // (e.g. RHEL and Centos). In those cases, we scan the file for an
    // identifier, that basically consists of the first word of the linux
    // distribution name (e.g. "red" for Red Hat). In case there is no match, we
    // just assume the first distribution in our list.
    const { distros } = distroFile;
    linuxInfo.name =
      distros.find(d => contents.indexOf(getLinuxDistroId(d)) >= 0) ||
      distros[0];

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

/**
 * Computes Electron-specific default fields for events.
 *
 * The event defaults include contexts for the Electron, Node and Chrome
 * runtimes, limited device information, operating system context and defaults
 * for the release and environment.
 */
async function getEventDefaults(): Promise<SentryEvent> {
  return {
    contexts: {
      app: {
        app_name: app.getName(),
        app_version: app.getVersion(),
        build_type: getBuildType(),
      },
      chrome: {
        name: 'Chrome',
        type: 'runtime',
        version: process.versions.chrome,
      },
      device: {
        arch: process.arch,
      },
      node: {
        name: 'Node',
        type: 'runtime',
        version: process.versions.node,
      },
      os: await getOsContext(),
      runtime: {
        name: 'Electron',
        version: process.versions.electron,
      },
    },
    environment: process.defaultApp ? 'development' : 'production',
    extra: { crashed_process: 'browser' },
    release: `${getPackageJson().name}@${app.getVersion()}`,
    user: { ip_address: '{{auto}}' },
  };
}

/** Merges the given event payload with SDK defaults. */
export async function addEventDefaults(
  event: SentryEvent,
): Promise<SentryEvent> {
  // The event defaults are cached as long as the app is running. We create the
  // promise here synchronously to avoid multiple events computing them at the
  // same time.
  if (!defaultsPromise) {
    defaultsPromise = getEventDefaults();
  }

  const { contexts = {} } = event;
  const { contexts: defaultContexts = {}, ...defaults } = await defaultsPromise;

  // Perform a manual deep merge of the defaults with the event data.
  // TODO: Use a proper deep merge here, instead.
  return {
    ...defaults,
    ...event,
    contexts: {
      ...defaultContexts,
      ...contexts,
      app: { ...defaultContexts.app, ...contexts.app },
      device: { ...defaultContexts.device, ...contexts.device },
      os: { ...defaultContexts.os, ...contexts.os },
      runtime: { ...defaultContexts.runtime, ...contexts.runtime },
    },
    extra: { ...defaults.extra, ...event.extra },
    user: { ...defaults.user, ...event.user },
  };
}
