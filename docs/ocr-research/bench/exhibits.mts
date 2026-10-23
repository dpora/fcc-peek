// OCR the FCC label-exhibit set (tests/fcc_exhibits, built by collect/fcc_exhibits.py)
// with Tesseract (app settings) and PaddleOCR, clean and degraded copies.
// Writes exhibits-texts.json (resumable); score it with suggest.mts.
// Run: node --experimental-strip-types exhibits.mts <dir containing node_modules with @gutenye/ocr-node and sharp>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const req = createRequire(join(process.argv[2], 'package.json'));
const load = async (pkg: string) => (await import(pathToFileURL(req.resolve(pkg)).href)).default;
const Ocr = await load('@gutenye/ocr-node');
const sharp = await load('sharp');
const repo = join(import.meta.dirname, '../../..');
const { default: Tesseract } = await import(pathToFileURL(join(repo, 'node_modules/tesseract.js/src/index.js')).href);

const root = join(repo, 'tests/fcc_exhibits');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Record<string, { idInTextLayer: boolean }>;
const outFile = join(import.meta.dirname, 'exhibits-texts.json');
const rows: { folder: string; id: string; text: Record<string, string>; ms: Record<string, number> }[] =
  existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : [];
// Image-only exhibits weren't checked for a legible ID (some are tiny print), so score them apart.
const imageOnly = (id: string) => (manifest[id]?.idInTextLayer ? '' : '_imageonly');
for (const r of rows) r.folder = r.folder.replace(/_imageonly$/, '') + imageOnly(r.id);
const done = new Set(rows.map((r) => r.folder + '/' + r.id));

const tess = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
  langPath: join(repo, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cachePath: process.cwd(),
});
await tess.setParameters({ tessedit_pageseg_mode: '3', thresholding_method: '0' });
const paddle = await Ocr.create();

let n = 0;
for (const id of Object.keys(manifest)) {
  for (const [base, file] of [['exhibit_clean', `clean/${id}.png`], ['exhibit_degraded', `degraded/${id}.jpg`]]) {
    const folder = base + imageOnly(id);
    if (done.has(folder + '/' + id)) continue;
    const path = join(root, file);
    const buf = await sharp(readFileSync(path)).png().toBuffer();
    const r = { folder, id, text: {} as Record<string, string>, ms: {} as Record<string, number> };
    let t = performance.now();
    r.text.tessApp = (await tess.recognize(buf)).data.text;
    r.ms.tessApp = performance.now() - t;
    t = performance.now();
    r.text.paddle = (await paddle.detect(path)).texts.map((l: { text: string }) => l.text).join('\n');
    r.ms.paddle = performance.now() - t;
    rows.push(r);
    if (++n % 20 === 0) {
      writeFileSync(outFile, JSON.stringify(rows, null, 1));
      console.log(`${rows.length} images`);
    }
  }
}
await tess.terminate();
writeFileSync(outFile, JSON.stringify(rows, null, 1));
console.log(`done: ${rows.length} images`);
