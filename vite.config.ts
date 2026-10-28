import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { target: 'es2022' },
  // WASM-only ONNX Runtime for PaddleOCR: the default build adds WebGPU and a 30 MB WASM file.
  resolve: { alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }] },
  plugins: [
    {
      // js-clipper (used by @gutenye/ocr-common) ships Latin-1 bytes, which the bundler rejects as UTF-8.
      name: 'latin1-js-clipper',
      enforce: 'pre',
      load(id) {
        if (/js-clipper[\\/]clipper\.js$/.test(id)) return readFileSync(id, 'latin1');
      },
    },
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
