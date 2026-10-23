// Does fccid.io's "similar IDs" (HTTP 300) list rescue OCR misreads?
// For every image: matcher candidates from saved OCR text -> fccid.io lookup -> resolution policy.
// Run: node --experimental-strip-types suggest.mts [cacheDir]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { findBareCandidates, findCandidates, normalize } from '../../../src/fccId.ts';

const CACHE = process.argv[2] ?? join(import.meta.dirname, '.fccidio-cache');
mkdirSync(CACHE, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

type Page =
  | { kind: 'device'; id: string; redirected: boolean }
  | { kind: 'grantee' }
  | { kind: 'similar'; rows: { id: string; match: string }[] }
  | { kind: 'search' }
  | { kind: 'notfound'; grantee: boolean }
  | { kind: 'other'; status: number };

async function lookup(id: string): Promise<Page> {
  const file = join(CACHE, encodeURIComponent(id) + '.json');
  let status: number, html: string, redirected = false;
  if (existsSync(file)) ({ status, html, redirected } = JSON.parse(readFileSync(file, 'utf8')));
  else {
    await new Promise((r) => setTimeout(r, 800));
    // curl, not fetch: Cloudflare answers Node's fetch with a 403 challenge even with browser headers.
    // -L follows fccid.io's 303 (it corrects some look-alike misreads itself), as a browser fetch would.
    const out = execFileSync('curl', ['-s', '-L', '-A', UA, '-H', 'Accept: text/html', '-w', '\n%{http_code} %{num_redirects}', `https://fccid.io/${encodeURIComponent(id)}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const cut = out.lastIndexOf('\n');
    const [code, hops] = out.slice(cut + 1).split(' ');
    status = Number(code);
    redirected = hops !== '0';
    html = out.slice(0, cut);
    if (status !== 403) writeFileSync(file, JSON.stringify({ status, html, redirected }));
  }
  const title = /<title>([^<]*)/.exec(html)?.[1] ?? '';
  if (status === 200) {
    if (/FCC ID Applications \(/.test(title)) return { kind: 'grantee' };
    const m = /^FCC ID (\S+)/.exec(title);
    return m ? { kind: 'device', id: m[1], redirected } : { kind: 'other', status };
  }
  if (status === 300 && /Possible Matches/.test(title)) {
    const rows = [...html.matchAll(/<tr>\s*<td>\s*<a href="\/([^"]+)"[^>]*>[^<]*<\/a>\s*<\/td>\s*<td>([^<]*)/g)].map((m) => ({
      id: decodeURIComponent(m[1]),
      match: m[2].trim(),
    }));
    return { kind: 'similar', rows };
  }
  if (status === 300) return { kind: 'search' };
  if (status === 404) return { kind: 'notfound', grantee: html.includes('Grantee Code Found') };
  return { kind: 'other', status };
}

// Characters OCR confuses on printed labels.
const GROUPS = ['0ODQ', '1IL7', '5S', '8B', '2Z', '6G', 'UV', '4A'];
const LOOK = new Set<string>();
for (const g of GROUPS) for (const a of g) for (const b of g) if (a !== b) LOOK.add(a + b);

const flat = (id: string) => id.toUpperCase().replace(/-/g, '');

// Weighted edit distance: look-alike substitution 0.25, any other edit 1.
export function distance(a: string, b: string): number {
  a = flat(a); b = flat(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : LOOK.has(a[i - 1] + b[j - 1]) ? 0.25 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub);
    }
  return d[a.length][b.length];
}

// Characters OCR tends to drop or invent (thin vertical strokes).
const THIN = new Set(['I', '1', 'L']);
// Letter pairs OCR merges or splits, both directions.
const MERGES: [string, string][] = [['RN', 'M'], ['VV', 'W'], ['CL', 'D']];

// 'ocr+': extra confusions seen most in fccid.io's own 303 corrections of the exhibit set.
const LOOK_PLUS = new Set(LOOK);
for (const [x, y] of ['S8', 'S9', 'T7']) LOOK_PLUS.add(x + y).add(y + x);

// Fewest common OCR mistakes that turn `read` into `sugg`; Infinity if any difference is not one.
export function ocrFixes(read: string, sugg: string, look = LOOK): number {
  const a = flat(read), b = flat(sugg);
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(Infinity));
  d[0][0] = 0;
  for (let i = 0; i <= a.length; i++)
    for (let j = 0; j <= b.length; j++) {
      const cur = d[i][j];
      if (cur === Infinity) continue;
      if (i < a.length && j < b.length && (a[i] === b[j] || look.has(a[i] + b[j])))
        d[i + 1][j + 1] = Math.min(d[i + 1][j + 1], cur + (a[i] === b[j] ? 0 : 1));
      if (i < a.length && THIN.has(a[i])) d[i + 1][j] = Math.min(d[i + 1][j], cur + 1); // invented stroke
      if (j < b.length && THIN.has(b[j])) d[i][j + 1] = Math.min(d[i][j + 1], cur + 1); // dropped stroke
      for (const [two, one] of MERGES) {
        if (a.startsWith(two, i) && b.startsWith(one, j)) d[i + 2][j + 1] = Math.min(d[i + 2][j + 1], cur + 1);
        if (a.startsWith(one, i) && b.startsWith(two, j)) d[i + 1][j + 2] = Math.min(d[i + 1][j + 2], cur + 1);
      }
    }
  return d[a.length][b.length];
}

type Policy = 'exact' | 'first' | 'look' | 'look1' | 'ocr' | 'ocr+';
// Returns resolved ID, or null; 'look*' only auto-picks a unique best suggestion under the threshold.
// 'exact'/'first' trust fccid.io's 303 redirects blindly (as the app does today); the others
// accept a redirect only under the same closeness rule as a suggestion (it can be far off: LABEL -> EA46GJLABEL).
function resolve(page: Page, read: string, policy: Policy): { id: string | null; dist?: number } {
  if (page.kind === 'device') {
    if (!page.redirected || policy === 'exact' || policy === 'first') return { id: page.id };
    const dist = policy.startsWith('ocr') ? ocrFixes(read, page.id, policy === 'ocr+' ? LOOK_PLUS : LOOK) : distance(read, page.id);
    return dist <= (policy.startsWith('ocr') ? 3 : policy === 'look' ? 0.75 : 1.25) ? { id: page.id, dist } : { id: null, dist };
  }
  if (page.kind !== 'similar' || policy === 'exact' || !page.rows.length) return { id: null };
  if (policy === 'first') return { id: page.rows[0].id };
  if (policy.startsWith('ocr')) {
    const look = policy === 'ocr+' ? LOOK_PLUS : LOOK;
    const ok = page.rows.map((r) => ({ id: r.id, dist: ocrFixes(read, r.id, look) })).filter((r) => r.dist <= 3).sort((x, y) => x.dist - y.dist);
    if (!ok.length || (ok[1] && ok[1].dist === ok[0].dist)) return { id: null }; // none, or a tie: ask the user
    return ok[0];
  }
  const max = policy === 'look' ? 0.75 : 1.25;
  const scored = page.rows.map((r) => ({ id: r.id, dist: distance(read, r.id) })).sort((x, y) => x.dist - y.dist);
  const best = scored[0];
  if (best.dist > max) return { id: null, dist: best.dist };
  if (scored[1] && scored[1].dist === best.dist) return { id: null, dist: best.dist }; // tie: ask the user
  return best;
}

// Texts files to score (default: the 65 real photos); results grouped by set.
const files = process.argv.slice(3).length ? process.argv.slice(3) : ['all-texts.json', 'batch2-texts.json'];
const items = files.flatMap((f) => JSON.parse(readFileSync(join(import.meta.dirname, f), 'utf8'))) as {
  folder: string; id: string; text: Record<string, string>;
}[];
const group = (folder: string) => (folder.startsWith('exhibit') ? folder : 'photos');

// '+bare': when no labelled ID resolves, try unlabelled ID-shaped words, exact fccid.io match only.
const POLICIES = ['exact', 'first', 'look', 'look1', 'ocr', 'ocr+', 'look1+bare', 'ocr+bare'] as const;
const report: unknown[] = [];
for (const engine of ['tessApp', 'paddle']) {
  for (const g of [...new Set(items.map((it) => group(it.folder)))]) {
    const set = items.filter((it) => group(it.folder) === g);
    const tally: Record<string, { right: number; wrong: number }> = {};
    for (const p of POLICIES) tally[p] = { right: 0, wrong: 0 };
    let ocrRight = 0;
    for (const it of set) {
      const want = flat(normalize(it.id));
      const cands = findCandidates(it.text[engine] ?? '').map((c) => c.id);
      if (cands.some((c) => flat(c) === want)) ocrRight++;
      const pages = [];
      for (const c of cands) pages.push({ read: c, page: await lookup(c) });
      const bare: { read: string; page: Page }[] = [];
      const bareIds = findBareCandidates(it.text[engine] ?? '').filter((b) => !cands.includes(b));
      const row: Record<string, unknown> = { engine, folder: it.folder, id: it.id, reads: pages.map((p) => `${p.read}:${p.page.kind}${p.page.kind === 'device' && p.page.redirected ? '(303)' : ''}`) };
      for (const p of POLICIES) {
        // First candidate that resolves wins, as the app would show it.
        let got: string | null = null;
        const base = p.replace('+bare', '') as Policy;
        for (const { read, page } of pages) {
          const r = resolve(page, read, base);
          if (r.id) { got = r.id; break; }
        }
        if (!got && p.endsWith('+bare'))
          for (const b of bareIds) {
            if (!bare.some((x) => x.read === b)) bare.push({ read: b, page: await lookup(b) });
            const page = bare.find((x) => x.read === b)!.page;
            if (page.kind === 'device' && !page.redirected) { got = page.id; break; }
          }
        row[p] = got;
        if (got) tally[p][flat(got) === want ? 'right' : 'wrong']++;
      }
      const sim = pages.find((p) => p.page.kind === 'similar');
      if (sim && sim.page.kind === 'similar')
        row.suggestions = sim.page.rows.map((r) => `${r.id} (${r.match}, d=${distance(sim.read, r.id)}, fixes=${ocrFixes(sim.read, r.id)})`);
      report.push(row);
    }
    console.log(`\n== ${engine} / ${g}: OCR read correct ${ocrRight}/${set.length}`);
    for (const p of POLICIES) console.log(`  ${p.padEnd(10)} resolved right ${tally[p].right}, resolved WRONG ${tally[p].wrong}`);
  }
}
const outName = files.length === 1 ? files[0].replace('-texts.json', '-results.json') : 'suggest-results.json';
writeFileSync(join(import.meta.dirname, outName), JSON.stringify(report, null, 1));
