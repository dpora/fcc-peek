// Paddle only: clean 3:1 viewfinder crops resized to fixed widths (crop3_w<width>/, made with PIL LANCZOS).
// Writes viewfinder-size-texts.json (committed results came from two runs: size = 480/640/800, size2 = 320/400).
// Run: node --experimental-strip-types viewfinder-size.mts <paddle node_modules dir> <repo root>
import { readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
const req = createRequire(join(process.argv[2], 'package.json'));
const Ocr = (await import(pathToFileURL(req.resolve('@gutenye/ocr-node')).href)).default;
const repo = process.argv[3];
const root = join(repo, 'tests/fcc_exhibits/viewfinder');
const paddle = await Ocr.create();
const rows: unknown[] = [];
for (const w of [320, 400, 480, 640, 800]) {
  for (const f of readdirSync(join(root, `crop3_w${w}`))) {
    const text = (await paddle.detect(join(root, `crop3_w${w}`, f))).texts.map((l: { text: string }) => l.text).join('\n');
    rows.push({ folder: `exhibit_vf_crop3_w${w}`, id: parse(f).name, text: { paddle: text } });
  }
  console.log('done', w);
}
writeFileSync(join(repo, 'docs/ocr-research/bench/viewfinder-size-texts.json'), JSON.stringify(rows, null, 1));
