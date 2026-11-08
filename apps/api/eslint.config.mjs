// Standalone ESLint config for @sigma/api.
//
// It mirrors the root eslint.config.mjs rules instead of importing them so the API can
// lint with its own TypeScript/typescript-eslint pair (the Nest toolchain pins its own
// typescript@6 devDependency). The root is also on TypeScript 6 (ADR-0008); this file can
// collapse to `import rootConfig from '../../eslint.config.mjs'` once the two are aligned.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      // Lets `consistent-type-imports` keep value imports that are only referenced as
      // constructor parameter types, which Nest's DI needs for emitted decorator metadata.
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
  },
);
