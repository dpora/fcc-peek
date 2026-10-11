export interface Candidate {
  id: string;
  source: 'label' | 'module';
  raw: string;
}

// 4–19 chars, no leading/trailing dash.
const ID_RE = /^[A-Z0-9][A-Z0-9-]{2,17}[A-Z0-9]$/;
// "FCC ID", "FCCID", "FCC-ID", OCR variants of the I ("l", "1", "|"), optional "Contains".
// Ends with \s*, so an ID printed on the line after "FCC ID:" is still reached.
const LABEL_SOURCE = String.raw`(CONTAINS\s+)?F\s?C\s?C\s*[-_.]?\s*[I1L|]\s?D\s*[:;.#]?\s*`;
// First token after the label, and optionally a second token on the same line.
const TOKEN_RE = /^(\S+)(?:[ \t]+(\S+))?/;
// Words that start the next field on a label, never part of an FCC ID.
const STOP_WORDS = new Set(['IC', 'MODEL', 'CAN', 'ICES', 'SN', 'S/N', 'CMIIT', 'PN', 'P/N']);

export function normalize(id: string): string {
  return id
    .toUpperCase()
    .replace(/[‐-―_]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[.,;:]+$/, '');
}

export function isPlausible(id: string): boolean {
  return ID_RE.test(normalize(id));
}

function isGranteeOnly(token: string): boolean {
  return token.length === 3 || (token.length === 5 && token.startsWith('2'));
}

export function findCandidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  const seen = new Set<string>();
  const label = new RegExp(LABEL_SOURCE, 'gi');
  let m: RegExpExecArray | null;
  while ((m = label.exec(text)) !== null) {
    const start = label.lastIndex;
    const tok = TOKEN_RE.exec(text.slice(start));
    if (!tok) continue;

    let id = normalize(tok[1]);
    let consumed = tok[1].length;
    const next = tok[2];
    if (
      next !== undefined &&
      isGranteeOnly(id) &&
      !next.endsWith(':') &&
      !STOP_WORDS.has(normalize(next)) &&
      /^[A-Z0-9-]+[.,;]?$/i.test(next)
    ) {
      id += normalize(next);
      consumed = tok[0].length;
    }
    if (!isPlausible(id) || seen.has(id)) continue;
    seen.add(id);
    const raw = text.slice(m.index, start + consumed).replace(/\s+/g, ' ').trim();
    found.push({ id, source: m[1] ? 'module' : 'label', raw });
  }
  return found;
}
