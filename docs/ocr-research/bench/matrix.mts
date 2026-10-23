import Tesseract from 'file:///<repo>/node_modules/tesseract.js/src/index.js';
import sharp from 'sharp';
import { readdirSync, readFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { findCandidates, normalize } from 'file:///<repo>/src/fccId.ts';
const { createWorker, OEM } = Tesseract;
const repo = '<repo>';
const dir = join(repo, 'tests/example_images');
const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: join(repo, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cachePath: process.cwd(),
});
type Prep = (b: Buffer) => Promise<Buffer>;
const fit = (px: number) => (s: sharp.Sharp) => s.resize(px, px, { fit: 'inside', withoutEnlargement: false });
const variants: Record<string, { prep: Prep; psm: string }> = {
  'raw/psm3':        { prep: async (b) => sharp(b).png().toBuffer(), psm: '3' },
  'raw/psm11':       { prep: async (b) => sharp(b).png().toBuffer(), psm: '11' },
  'gray1600/psm3':   { prep: async (b) => fit(1600)(sharp(b).grayscale()).png().toBuffer(), psm: '3' },
  'gray1600/psm11':  { prep: async (b) => fit(1600)(sharp(b).grayscale()).png().toBuffer(), psm: '11' },
  'gray2400/psm11':  { prep: async (b) => fit(2400)(sharp(b).grayscale()).png().toBuffer(), psm: '11' },
  'inv1600/psm11':   { prep: async (b) => fit(1600)(sharp(b).grayscale().negate({ alpha: false })).png().toBuffer(), psm: '11' },
  'norm1600/psm11':  { prep: async (b) => fit(1600)(sharp(b).grayscale().normalise()).png().toBuffer(), psm: '11' },
};
const files = readdirSync(dir);
const union: Record<string, Set<string>> = {};
const score: Record<string, number> = {};
console.log('file'.padEnd(18) + Object.keys(variants).map((v) => v.padEnd(16)).join(''));
for (const f of files) {
  const expected = normalize(parse(f).name);
  const buf = readFileSync(join(dir, f));
  const cells: string[] = [];
  union[f] = new Set();
  for (const [name, v] of Object.entries(variants)) {
    await worker.setParameters({ tessedit_pageseg_mode: v.psm as any });
    const { data } = await worker.recognize(await v.prep(buf));
    const ids = findCandidates(data.text).map((c) => c.id);
    ids.forEach((i) => union[f].add(i));
    const ok = ids.includes(expected);
    score[name] = (score[name] ?? 0) + (ok ? 1 : 0);
    cells.push((ok ? 'OK' : ids[0] ? `~${ids[0]}` : '-').slice(0, 15).padEnd(16));
  }
  console.log(expected.slice(0, 17).padEnd(18) + cells.join(''));
}
console.log('\nscore'.padEnd(19) + Object.keys(variants).map((v) => String(score[v]).padEnd(16)).join(''));
let u = 0;
for (const f of files) { const e = normalize(parse(f).name); const hit = union[f].has(e); if (hit) u++; console.log(`union ${hit ? 'OK  ' : 'MISS'} ${e}: ${[...union[f]].join(', ')}`); }
console.log(`union of all variants: ${u}/${files.length}`);
await worker.terminate();
