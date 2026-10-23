import sharp from 'sharp';
import { readdirSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const files = readdirSync(dir).sort();
const T = 380, C = 4;
for (let s = 0; s * 16 < files.length; s++) {
  const chunk = files.slice(s * 16, s * 16 + 16);
  const tiles = await Promise.all(chunk.map(async (f, i) => {
    let img;
    try { img = await sharp(`${dir}/${f}`).flatten({ background: '#fff' }).resize(T, T, { fit: 'contain', background: '#fff' }).jpeg().toBuffer(); }
    catch { img = await sharp({ create: { width: T, height: T, channels: 3, background: '#ccc' } }).jpeg().toBuffer(); }
    const label = Buffer.from(`<svg width="${T}" height="40"><rect width="70" height="40" fill="#d00"/><text x="6" y="30" font-size="28" fill="#fff" font-family="Arial">${f.split('.')[0]}</text></svg>`);
    return [{ input: img, left: (i % C) * T, top: Math.floor(i / C) * T }, { input: label, left: (i % C) * T, top: Math.floor(i / C) * T }];
  }));
  await sharp({ create: { width: T * C, height: T * Math.ceil(chunk.length / C), channels: 3, background: '#fff' } })
    .composite(tiles.flat()).jpeg({ quality: 80 }).toFile(`${out}/sheet${s + 1}.jpg`);
}
