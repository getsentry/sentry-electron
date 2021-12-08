type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

type OrBool<T> = {
  [P in keyof T]: T[P] | boolean;
};

type OrFalse<T> = {
  [P in keyof T]: T[P] | false;
};
