// OCR the viewfinder simulation (tests/fcc_exhibits/viewfinder, built by collect/viewfinder.py):
// full camera frame vs the box cropped at 2:1, 3:1, 4:1, clean and degraded, plus a centred 3:1 crop
// of each real photo. Tesseract (app settings) and PaddleOCR.
// Writes viewfinder-texts.json (resumable); score it with suggest.mts.
// Run: node --experimental-strip-types viewfinder.mts <dir containing node_modules with @gutenye/ocr-node and sharp>
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

const root = join(repo, 'tests/fcc_exhibits/viewfinder');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
  exhibits: Record<string, unknown>;
  photos: Record<string, { folder: string; id: string }>;
};
const jobs: { folder: string; id: string; path: string }[] = [];
for (const v of ['frame', 'crop2', 'crop3', 'crop4'])
  for (const d of ['', '_degraded'])
    for (const id of Object.keys(manifest.exhibits))
      jobs.push({ folder: `exhibit_vf_${v}${d}`, id, path: join(root, v + d, `${id}.${v === 'frame' && d ? 'jpg' : 'png'}`) });
for (const [name, p] of Object.entries(manifest.photos))
  jobs.push({ folder: 'photo_vf_crop3', id: p.id, path: join(root, 'photos_crop3', name) });

const outFile = join(import.meta.dirname, 'viewfinder-texts.json');
const rows: { folder: string; id: string; text: Record<string, string>; ms: Record<string, number> }[] =
  existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : [];
const done = new Set(rows.map((r) => r.folder + '/' + r.id));

const tess = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
  langPath: join(repo, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cachePath: process.cwd(),
});
await tess.setParameters({ tessedit_pageseg_mode: '3', thresholding_method: '0' });
const paddle = await Ocr.create();

let n = 0;
for (const { folder, id, path } of jobs) {
  if (done.has(folder + '/' + id)) continue;
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
    console.log(`${rows.length}/${jobs.length} images`);
  }
}
await tess.terminate();
writeFileSync(outFile, JSON.stringify(rows, null, 1));
console.log(`done: ${rows.length} images`);
