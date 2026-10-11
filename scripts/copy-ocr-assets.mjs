// Copies Tesseract.js worker, WASM core and English data into public/ocr so the
// app serves them from its own origin instead of a third-party CDN.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'ocr');

function find(...paths) {
  const hit = paths.find((p) => existsSync(p));
  if (!hit) throw new Error(`copy-ocr-assets: missing ${paths.join(' | ')}`);
  return hit;
}

mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

cpSync(find(join(nm, 'tesseract.js', 'dist', 'worker.min.js')), join(out, 'worker.min.js'));

const coreDir = find(join(nm, 'tesseract.js', 'node_modules', 'tesseract.js-core'), join(nm, 'tesseract.js-core'));
const cores = readdirSync(coreDir).filter((f) => /^tesseract-core.*\.wasm\.js$/.test(f));
if (cores.length < 4) throw new Error(`copy-ocr-assets: expected 4 core files in ${coreDir}, found ${cores.length}`);
for (const f of cores) cpSync(join(coreDir, f), join(out, 'core', f));

cpSync(
  find(join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz')),
  join(out, 'lang', 'eng.traineddata.gz'),
);

console.log(`copy-ocr-assets: worker, ${cores.length} core files, eng.traineddata.gz -> public/ocr`);
