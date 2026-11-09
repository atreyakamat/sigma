import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Production build: bundles the API (and the TypeScript-source workspace packages it imports)
 * into one CommonJS file. node_modules dependencies stay external. Decorator metadata is emitted
 * from tsconfig (experimentalDecorators + emitDecoratorMetadata), which NestJS DI requires.
 */
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: { main: 'src/main.ts', embedded: 'src/embedded.ts' },
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        chunkFileNames: 'chunks/[name]-[hash].cjs',
      },
    },
  },
  ssr: { noExternal: [/^@sigma\//], target: 'node' },
});
