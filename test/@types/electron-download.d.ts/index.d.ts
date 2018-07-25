interface DownloadOptions {
  version: string;
  arch?: string;
  platform?: string;
  cache?: string;
}

declare module 'electron-download' {
  function download(options: DownloadOptions, callback: (err: Error, zipPath: string) => void): void;

  export = download;
}
