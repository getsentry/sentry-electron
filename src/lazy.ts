export class Lazy<T> {
  private cached: T;

  constructor(private getValue: () => T) {
  }

  public get value() {
    if (this.cached == undefined) {
      this.cached = this.getValue();
    }

    return this.cached;
  }
}
