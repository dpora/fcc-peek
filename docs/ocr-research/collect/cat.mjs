import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const UA = { 'User-Agent': 'fcc-peek-test-collector/0.1 (contact@example.com)' };
const seen = new Set([...Object.keys(JSON.parse(readFileSync('meta.json', 'utf8'))), ...Object.keys(JSON.parse(readFileSync('meta2.json', 'utf8')))]);
const cats = ['Mini PCIe cards', 'M.2', 'Wi-Fi network cards', 'WLAN network cards', 'Intel Wireless-N 7260', 'Intel AX201NGW', 'Intel Centrino Wireless-N 2230', 'TP-Link USB Wi-Fi adapters', 'USB Wi-Fi adapter', 'Nintendo Wi-Fi USB Connector', 'Wireless routers', 'TP-Link TL-WR740N', 'Linksys WRT54G series', 'DECT telephones', 'Cordless telephones'];
const titles = new Set();
for (const c of cats) {
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtype=file&cmlimit=60&cmtitle=${encodeURIComponent('Category:' + c)}`, { headers: UA })).json();
  const files = (j.query?.categorymembers ?? []).map((m) => m.title).filter((t) => /\.(jpe?g|png)$/i.test(t) && !seen.has(t));
  // spread picks across the category instead of the first N (often near-duplicate shots)
  const step = Math.max(1, Math.floor(files.length / 10));
  for (let i = 0; i < files.length && i / step < 10; i += step) titles.add(files[i]);
}
const list = [...titles];
mkdirSync('cand3', { recursive: true });
const meta = {};
for (let i = 0; i < list.length; i += 40) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600&titles=' + encodeURIComponent(list.slice(i, i + 40).join('|'));
  const j = await (await fetch(u, { headers: UA })).json();
  for (const p of Object.values(j.query.pages)) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const em = ii.extmetadata ?? {};
    meta[p.title] = { url: ii.thumburl ?? ii.url, page: ii.descriptionurl, license: em.LicenseShortName?.value, artist: (em.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim() };
  }
}
let n = 300;
for (const m of Object.values(meta)) {
  m.local = String(++n) + '.' + ((m.url.match(/\.(jpe?g|png)$/i)?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg'));
  const r = await fetch(m.url, { headers: UA });
  writeFileSync('cand3/' + m.local, Buffer.from(await r.arrayBuffer()));
  await new Promise((res) => setTimeout(res, 250));
}
writeFileSync('meta3.json', JSON.stringify(meta, null, 1));
console.log(Object.keys(meta).length, 'downloaded');
