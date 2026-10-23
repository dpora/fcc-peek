export interface Candidate { id: string; source: 'label' | 'module'; raw: string }
const ID_RE = /^[A-Z0-9][A-Z0-9-]{2,17}[A-Z0-9]$/;
// "FCC" with OCR slips: first letter garbled or dropped ("Foc", "pec", "rcc", "CC"), O for C.
// "ID" read as "lD", "1D", "|D", "\D", "!D", or "10" when a colon follows.
const LABEL_SOURCE = String.raw`(CONTAINS\s+)?\b[A-Z]?[CEO]\s?C\s*[-_.]?\s*(?:[I1L|!\\]\s?D|10(?=\s*[:;]))\s*[:;.#*]?\s*`;
const TOKEN_RE = /^(\S+)(?:[ \t]+(\S+))?/;
const STOP_WORDS = new Set(['IC', 'MODEL', 'CAN', 'ICES', 'SN', 'S/N', 'CMIIT', 'PN', 'P/N']);
export function normalize(id: string): string {
  return id.toUpperCase().replace(/[‐-―_]/g, '-').replace(/\s+/g, '').replace(/[.,;:]+$/, '');
}
export function isPlausible(id: string): boolean { return ID_RE.test(normalize(id)); }
function isGranteeOnly(t: string): boolean { return t.length === 3 || (t.length === 5 && t.startsWith('2')); }
export function findCandidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  const seen = new Set<string>();
  const add = (id: string, source: Candidate['source'], raw: string) => {
    if (!isPlausible(id) || seen.has(id)) return;
    seen.add(id);
    found.push({ id, source, raw });
  };
  const label = new RegExp(LABEL_SOURCE, 'gi');
  let m: RegExpExecArray | null;
  while ((m = label.exec(text)) !== null) {
    const start = label.lastIndex;
    const tok = TOKEN_RE.exec(text.slice(start));
    if (!tok) continue;
    const first = normalize(tok[1]);
    const next = tok[2];
    const joinable = next !== undefined && !next.endsWith(':') && !STOP_WORDS.has(normalize(next)) && /^[A-Z0-9-]+[.,;]?$/i.test(next);
    const source = m[1] ? 'module' : 'label';
    const rawTo = (n: number) => text.slice(m!.index, start + n).replace(/\s+/g, ' ').trim();
    if (joinable && isGranteeOnly(first)) {
      add(first + normalize(next!), source, rawTo(tok[0].length));
      continue;
    }
    add(first, source, rawTo(tok[1].length));
    // A product code split by a stray space ("ABZ99F T4056"): offer the joined form too.
    if (joinable && /\d/.test(next!) && normalize(next!).length <= 6) add(first + normalize(next!), source, rawTo(tok[0].length));
  }
  return found;
}
