module.exports = {
  root: true,
  env: {
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: ['build/**', '**/dist/**', 'esm/**', 'example/**', 'scripts/**', 'test/integration/**'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    {
      files: ['test/**'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    '@sentry-internal/sdk/no-async-await': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
