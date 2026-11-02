// Copies the PaddleOCR (PP-OCRv4) models into public/ocr so the app serves them from its
// own origin instead of a third-party CDN. Vite bundles the ONNX Runtime WASM file itself.
// Also copies the pdf.js decoders and fonts into public/pdfjs (see src/pdfView.ts).
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

// pdf.js loads these at runtime: without them JPEG 2000 photos (common in FCC exhibits)
// and JBIG2 scans are silently dropped, and the 14 standard PDF fonts fall back.
const pdfjs = join(root, 'public', 'pdfjs');
mkdirSync(join(pdfjs, 'wasm'), { recursive: true });
for (const f of ['openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'jbig2.wasm', 'jbig2_nowasm_fallback.js', 'qcms_bg.wasm']) {
  copy(join(nm, 'pdfjs-dist', 'wasm', f), join(pdfjs, 'wasm', f));
}
cpSync(join(nm, 'pdfjs-dist', 'standard_fonts'), join(pdfjs, 'standard_fonts'), { recursive: true });

console.log('copy-ocr-assets: pdf.js wasm decoders and standard fonts -> public/pdfjs');
