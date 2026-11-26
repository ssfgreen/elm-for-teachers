import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'analysis/**', 'fixtures/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['packages/*/scripts/**/*.mjs', 'scripts/**/*.mjs', 'api/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // The editor must not depend on the make kit; the kit draws into it through components/slots.
    files: ['packages/client/src/**/*.{ts,tsx}'],
    ignores: ['packages/client/src/make/**', 'packages/client/src/App.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/make/*', './make/*'], message: 'Only the make kit and App.tsx import make/. Draw into the editor through components/slots instead.' }, { group: ['@edw/library', '@edw/library/*', '**/library/src/*', '**/library/src/**'], message: 'The app never imports library/: it reaches a library server over HTTP (plugins/library-client.ts).' }] },
      ],
    },
  },
  {
    // Libraries are another product: the server talks to one over HTTP, as to any other site.
    files: ['packages/{server,shared,evals}/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@edw/library', '@edw/library/*', '**/library/src/*', '**/library/src/**'], message: 'The app never imports library/: it reaches a library server over HTTP (plugins/library-client.ts).' }, { group: ['@libsql/*'], message: 'Only db/client.ts talks to the database driver. Import types from db/types.ts.' }] }] },
  },
  {
    // db/client.ts owns the driver; it keeps the library rule above but may import @libsql/client.
    files: ['packages/server/src/db/client.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@edw/library', '@edw/library/*', '**/library/src/*', '**/library/src/**'], message: 'The app never imports library/: it reaches a library server over HTTP (plugins/library-client.ts).' }] }] },
  },
);
