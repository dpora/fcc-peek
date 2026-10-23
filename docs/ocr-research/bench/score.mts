import { readFileSync } from 'node:fs';
import { parse } from 'node:path';
import * as A from 'file:///<repo>/src/fccId.ts';
import * as B from './fccId2.ts';
const texts = JSON.parse(readFileSync('texts.json', 'utf8')) as Record<string, Record<string, string>>;
const keys = Object.keys(Object.values(texts)[0]);
for (const [name, lib] of [['current', A], ['proto', B]] as const) {
  const per: Record<string, number> = {};
  let noise = 0;
  for (const [f, byKey] of Object.entries(texts)) {
    const e = A.normalize(parse(f).name);
    for (const k of keys) { const ids = lib.findCandidates(byKey[k]).map((c) => c.id); if (ids.includes(e)) per[k] = (per[k] ?? 0) + 1; noise += ids.filter((i) => i !== e).length; }
  }
  console.log(name, per, 'wrong candidates total:', noise);
}
// best ordered sequence of up to 3 passes with early exit (stop at first pass yielding any candidate)
for (const [name, lib] of [['current', A], ['proto', B]] as const) {
  let best: [number, string[]] = [0, []];
  const seqs: string[][] = [];
  for (const a of keys) { seqs.push([a]); for (const b of keys) if (b !== a) { seqs.push([a, b]); for (const c of keys) if (c !== a && c !== b) seqs.push([a, b, c]); } }
  for (const seq of seqs) {
    let s = 0;
    for (const [f, byKey] of Object.entries(texts)) {
      const e = A.normalize(parse(f).name);
      for (const k of seq) { const ids = lib.findCandidates(byKey[k]).map((c) => c.id); if (ids.length) { if (ids.includes(e)) s++; break; } }
    }
    if (s > best[0] || (s === best[0] && seq.length < best[1].length)) best = [s, seq];
  }
  console.log(name, 'best early-exit sequence:', best);
}
