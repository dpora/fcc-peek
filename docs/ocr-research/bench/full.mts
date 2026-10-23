import Tesseract from 'file:///<repo>/node_modules/tesseract.js/src/index.js';
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { findCandidates, normalize } from 'file:///<repo>/src/fccId.ts';
const { createWorker, OEM } = Tesseract;
const repo = '<repo>';
const dir = join(repo, 'tests/example_images');
const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: join(repo, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cachePath: process.cwd() });
const files = readdirSync(dir);
const texts: Record<string, Record<string, string>> = {};
const score: Record<string, number> = {};
for (const f of files) {
  const expected = normalize(parse(f).name);
  const buf = readFileSync(join(dir, f));
  texts[f] = {};
  const line: string[] = [];
  for (const size of [1600, 2400]) {
    const img = await sharp(buf).flatten({ background: '#fff' }).grayscale().resize(size, size, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
    for (const thr of ['0', '1', '2']) for (const psm of ['6', '11']) {
      const key = `s${size}/t${thr}/p${psm}`;
      await worker.setParameters({ tessedit_pageseg_mode: psm, thresholding_method: thr } as any);
      const { data } = await worker.recognize(img);
      texts[f][key] = data.text;
      const ok = findCandidates(data.text).some((c) => c.id === expected);
      score[key] = (score[key] ?? 0) + +ok;
      line.push(ok ? 'X' : '.');
    }
  }
  console.log(expected.padEnd(16), line.join(''));
}
console.log(score);
writeFileSync('texts.json', JSON.stringify(texts, null, 1));
await worker.terminate();
