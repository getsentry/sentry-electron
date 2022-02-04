export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type OrBool<T> = {
  [P in keyof T]: T[P] | boolean;
};

export type OrFalse<T> = {
  [P in keyof T]: T[P] | false;
};
