interface ExtractOptions {
  dir?: string;
  defaultDirMode?: number;
  defaultFileMode?: number;
}

declare module 'extract-zip' {
  function extract(
    source: string,
    options: ExtractOptions,
    callback: (err: Error) => void,
  ): void;

  export = extract;
}
