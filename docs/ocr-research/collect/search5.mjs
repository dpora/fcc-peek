import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const UA = { 'User-Agent': 'fcc-peek-test-collector/0.1 (contact@example.com)' };
const seen = new Set(['meta.json', 'meta2.json', 'meta3.json', 'meta4.json'].flatMap((f) => Object.keys(JSON.parse(readFileSync(f, 'utf8')))));
const queries = ['Typenschild WLAN', 'Typenschild Router', 'Typenschild Telefon', 'Typenschild Maus', 'Typenschild Tastatur', 'WLAN-Modul', 'Funkmodul', 'Bluetooth-Modul', 'WLAN-Karte', 'Typenschild Funk', 'Typenschild Fernbedienung', 'Typenschild Handy', 'Unterseite Router', 'Rückseite Typenschild', 'Typenschild Modem', 'Typenschild Access Point'];
const titles = new Set();
for (const q of queries) {
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=20&srsearch=${encodeURIComponent(q)}`, { headers: UA })).json();
  for (const r of j.query?.search ?? []) if (/\.(jpe?g|png)$/i.test(r.title) && !seen.has(r.title)) titles.add(r.title);
}
const list = [...titles];
mkdirSync('cand5', { recursive: true });
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
let n = 500;
for (const m of Object.values(meta)) {
  m.local = String(++n) + '.' + ((m.url.match(/\.(jpe?g|png)$/i)?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg'));
  for (let a = 0; a < 3; a++) {
    const r = await fetch(m.url, { headers: UA });
    const buf = Buffer.from(await r.arrayBuffer());
    if (r.ok && buf[0] !== 0x3c) { writeFileSync('cand5/' + m.local, buf); break; }
    await new Promise((res) => setTimeout(res, 4000));
  }
  await new Promise((res) => setTimeout(res, 400));
}
writeFileSync('meta5.json', JSON.stringify(meta, null, 1));
console.log(Object.keys(meta).length, 'downloaded');
