import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// js-clipper (used by @gutenye/ocr-common) ships Latin-1 bytes, which the bundler rejects as UTF-8.
// Needed twice: by `vite build`, and by the dev server's dependency pre-bundling, which doesn't
// run the main plugins.
const latin1JsClipper = {
  name: 'latin1-js-clipper',
  enforce: 'pre' as const,
  load(id: string) {
    if (/js-clipper[\\/]clipper\.js$/.test(id)) return readFileSync(id, 'latin1');
  },
};

export default defineConfig({
  build: { target: 'es2022' },
  // WASM-only ONNX Runtime for PaddleOCR: the default build adds WebGPU and a 30 MB WASM file.
  resolve: { alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }] },
  plugins: [latin1JsClipper],
  optimizeDeps: { rolldownOptions: { plugins: [latin1JsClipper] } },
  test: { include: ['tests/**/*.test.ts'] },
});
