import Ocr from 'file:///<scratchpad>/paddle/node_modules/@gutenye/ocr-node/build/index.js';
import sharp from 'sharp';
import { findCandidates } from 'file:///<repo>/src/fccId.ts';
const ocr = await Ocr.create();
const dir = '<repo>/tests/example_images/';
for (const f of ['web_batch2/C3K1409.jpg', 'web_batch2/VHE-3.jpg', 'web_batch2/PD97260NGU.jpg', 'wikimedia_commons/QDS-BRCM1020.jpg']) {
  for (const deg of [0, 90, 180, 270]) {
    const tmp = `rot-${deg}.png`;
    await sharp(dir + f).rotate(deg).png().toFile(tmp);
    const text = (await ocr.detect(tmp)).texts.map((l: any) => l.text).join('\n');
    console.log(f.split('/')[1].padEnd(22), String(deg).padStart(3), '->', JSON.stringify(findCandidates(text).map((c) => c.id)));
  }
}
