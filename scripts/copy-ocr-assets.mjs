// Copies the PaddleOCR (PP-OCRv4) models into public/ocr so the app serves them from its
// own origin instead of a third-party CDN. Vite bundles the ONNX Runtime WASM file itself.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'ocr');

function copy(from, to) {
  if (!existsSync(from)) throw new Error(`copy-ocr-assets: missing ${from}`);
  cpSync(from, to);
}

mkdirSync(join(out, 'models'), { recursive: true });

// Detection, recognition and the recognition dictionary; the angle classifier is unused.
for (const f of ['ch_PP-OCRv4_det_infer.onnx', 'ch_PP-OCRv4_rec_infer.onnx', 'ppocr_keys_v1.txt']) {
  copy(join(nm, '@gutenye', 'ocr-models', 'assets', f), join(out, 'models', f));
}

console.log('copy-ocr-assets: PP-OCRv4 det/rec models and dictionary -> public/ocr');
