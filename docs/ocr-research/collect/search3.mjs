import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const UA = { 'User-Agent': 'fcc-peek-test-collector/0.1 (contact@example.com)' };
const seen = new Set(Object.keys(JSON.parse(readFileSync('meta.json', 'utf8'))));
const keep = JSON.parse(readFileSync('search2.json', 'utf8')).filter((t) => !/Lund|virgin|Jacopo|Magazine|Herne|Ccp layer|GFiber|Flipper/i.test(t));
const queries = ['WLAN card label', 'Mini PCI Express WLAN', 'WiFi module label', 'Bluetooth adapter label', 'USB WLAN stick', 'wireless mouse bottom', 'wireless keyboard bottom', 'cordless phone bottom', 'router bottom', 'mobile phone battery removed', 'mobile phone label IMEI', 'GPS receiver bottom', 'remote control back label', 'baby monitor', 'walkie-talkie back', 'game controller back label', 'tablet back label', 'smartwatch back', 'access point bottom label', 'modem bottom label'];
const titles = new Set(keep);
for (const q of queries) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=12&srsearch=${encodeURIComponent(q)}`;
  const j = await (await fetch(u, { headers: UA })).json();
  for (const r of j.query?.search ?? []) if (/\.(jpe?g|png)$/i.test(r.title) && !seen.has(r.title)) titles.add(r.title);
}
const list = [...titles];
mkdirSync('cand2', { recursive: true });
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
let n = 100;
for (const m of Object.values(meta)) {
  m.local = String(++n) + '.' + ((m.url.match(/\.(jpe?g|png)$/i)?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg'));
  const r = await fetch(m.url, { headers: UA });
  writeFileSync('cand2/' + m.local, Buffer.from(await r.arrayBuffer()));
  await new Promise((res) => setTimeout(res, 250));
}
writeFileSync('meta2.json', JSON.stringify(meta, null, 1));
console.log(Object.keys(meta).length, 'downloaded');
