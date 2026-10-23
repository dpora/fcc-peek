import { readFileSync, writeFileSync } from 'node:fs';
const UA = { 'User-Agent': 'fcc-peek-test-collector/0.1 (contact@example.com)' };
const seen = new Set(Object.keys(JSON.parse(readFileSync('meta.json', 'utf8'))));
const queries = ['FCCID', 'FCC label', '"FCC" label back', 'regulatory label', 'rating label', 'FCC Part 15 label', 'wifi card label', 'mini pcie wlan', 'router bottom label', 'cordless phone label', 'bluetooth module', 'wireless card reverse', 'phone battery compartment label', 'type label device', 'modem label'];
const out = new Map();
for (const q of queries) {
  for (const offset of [0, 100]) {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=100&sroffset=${offset}&srsearch=${encodeURIComponent(q)}`;
    const j = await (await fetch(u, { headers: UA })).json();
    for (const r of j.query?.search ?? []) {
      if (!/\.(jpe?g|png|webp)$/i.test(r.title) || seen.has(r.title)) continue;
      const text = (r.title + ' ' + r.snippet).replace(/<[^>]+>/g, '');
      if (/FCC/i.test(text)) out.set(r.title, q);
    }
  }
}
writeFileSync('search2.json', JSON.stringify([...out.keys()], null, 1));
console.log(out.size, 'new titles mentioning FCC');
for (const [t, q] of [...out].slice(0, 200)) console.log(q.padEnd(22), t);
