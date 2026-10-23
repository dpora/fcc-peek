import Tesseract from 'file:///<repo>/node_modules/tesseract.js/src/index.js';
import Ocr from 'file:///<scratchpad>/paddle/node_modules/@gutenye/ocr-node/build/index.js';
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import * as cur from 'file:///<repo>/src/fccId.ts';
import * as proto from './fccId2.ts';
const repo = '<repo>';
const root = join(repo, 'tests/example_images');
const tess = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, { langPath: join(repo, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cachePath: process.cwd() });
const paddle = await Ocr.create();
const rows: any[] = [];
for (const folder of ['web_batch2']) {
  for (const f of readdirSync(join(root, folder)).filter((f) => !f.endsWith('.json'))) {
    const path = join(root, folder, f);
    const e = cur.normalize(parse(f).name);
    const buf = await sharp(readFileSync(path)).png().toBuffer();
    const r: any = { folder, id: e, text: {}, ms: {} };
    let t = performance.now();
    await tess.setParameters({ tessedit_pageseg_mode: '3', thresholding_method: '0' } as any);
    r.text.tessApp = (await tess.recognize(buf)).data.text; r.ms.tessApp = performance.now() - t;
    t = performance.now();
    const prep = await sharp(buf).flatten({ background: '#fff' }).grayscale().resize(1600, 1600, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
    await tess.setParameters({ tessedit_pageseg_mode: '11', thresholding_method: '2' } as any);
    r.text.tessBest = (await tess.recognize(prep)).data.text; r.ms.tessBest = performance.now() - t;
    t = performance.now();
    r.text.paddle = (await paddle.detect(path)).texts.map((l: any) => l.text).join('\n'); r.ms.paddle = performance.now() - t;
    rows.push(r);
  }
}
await tess.terminate();
writeFileSync('batch2-texts.json', JSON.stringify(rows, null, 1));
const configs: [string, string, any][] = [
  ['Tesseract, app today', 'tessApp', cur], ['Tesseract, tuned', 'tessBest', proto],
  ['Paddle, current matcher', 'paddle', cur], ['Paddle, looser matcher', 'paddle', proto],
];
const short = ['T-app', 'T-tuned', 'P-cur', 'P-loose'];
console.log('folder'.padEnd(9), 'id'.padEnd(18), short.map((s) => s.padEnd(8)).join(''));
const score: Record<string, Record<string, number>> = {};
const wrong: Record<string, number> = {};
for (const r of rows) {
  const cells = configs.map(([name, key, lib], i) => {
    const ids = lib.findCandidates(r.text[key]).map((c: any) => c.id);
    const ok = ids.includes(r.id);
    (score[name] ??= {})[r.folder] = (score[name][r.folder] ?? 0) + +ok;
    wrong[name] = (wrong[name] ?? 0) + ids.filter((x: string) => x !== r.id).length;
    return (ok ? 'OK' : ids[0] ? '~' + ids[0].slice(0, 6) : '-').padEnd(8);
  });
  console.log(r.folder.slice(0, 8).padEnd(9), r.id.slice(0, 17).padEnd(18), cells.join(''));
}
const n = (fo: string) => rows.filter((r) => r.folder === fo).length;
console.log('\nconfig'.padEnd(27), `b2(${n('web_batch2')})`.padEnd(10), ''.padEnd(10), 'total'.padEnd(7), 'wrong cands', 'avg ms');
for (const [name, key] of configs) {
  const u = score[name].web_batch2 ?? 0, w = 0;
  const ms = rows.reduce((a, r) => a + r.ms[key], 0) / rows.length;
  console.log(name.padEnd(26), String(u).padEnd(10), String(w).padEnd(10), String(u + w).padEnd(7), String(wrong[name]).padEnd(11), Math.round(ms));
}
