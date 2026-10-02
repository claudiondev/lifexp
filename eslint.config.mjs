import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // O service worker (push) roda fora da página: tem `self`, `clients` e `registration`, mas não `window`.
    files: ['apps/web/public/*-sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  prettier,
);
