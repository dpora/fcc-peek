import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const UA = { 'User-Agent': 'fcc-peek-test-collector/0.1 (contact@example.com)' };
const titles = JSON.parse(readFileSync('search1.json')).query.search.map((r) => r.title).filter((t) => /\.(jpe?g|png)$/i.test(t));
mkdirSync('cand', { recursive: true });
const meta = {};
for (let i = 0; i < titles.length; i += 40) {
  const batch = titles.slice(i, i + 40);
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600&titles=' + encodeURIComponent(batch.join('|'));
  const j = await (await fetch(u, { headers: UA })).json();
  for (const p of Object.values(j.query.pages)) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const em = ii.extmetadata ?? {};
    meta[p.title] = { url: ii.thumburl ?? ii.url, page: ii.descriptionurl, w: ii.width, h: ii.height,
      license: em.LicenseShortName?.value, artist: (em.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim() };
  }
}
let n = 0;
for (const [t, m] of Object.entries(meta)) {
  const name = String(++n).padStart(2, '0') + '.' + (m.url.match(/\.(jpe?g|png)$/i)?.[1] ?? 'jpg').toLowerCase();
  m.local = name;
  const r = await fetch(m.url, { headers: UA });
  writeFileSync('cand/' + name, Buffer.from(await r.arrayBuffer()));
  await new Promise((res) => setTimeout(res, 300));
}
writeFileSync('meta.json', JSON.stringify(meta, null, 1));
console.log(Object.keys(meta).length, 'downloaded');
