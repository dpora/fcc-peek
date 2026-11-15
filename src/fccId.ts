export interface Candidate {
  id: string;
  source: 'label' | 'module';
  raw: string;
}

// 4–19 chars, no leading/trailing dash.
const ID_RE = /^[A-Z0-9][A-Z0-9-]{2,17}[A-Z0-9]$/;
// "FCC ID", "FCCID", "FCC-ID", OCR variants of the I ("l", "1", "|"), optional "Contains",
// "FC ID"/"CC ID" with one C dropped (only at a word start, so not "ACCIDENT"; ids need a digit),
// not "FCC IDENTIFICATION"/"IDENTIFIER", optionally followed by "Number"/"No.".
// Punctuation may repeat ("FCC ID. :"). Ends with whitespace, so an ID printed on
// the line after "FCC ID:" is still reached.
const LABEL_SOURCE = String.raw`(CONTAINS\s+)?(?:F\s?C\s?C|(?<![A-Z0-9])([FC]\s?C))\s*[-_.]?\s*(?:CERTIFICATION\s+)?[I1L|]\s?D(?!ENTIF)[\s:;.#]*(?:(?:NUMBER|NUM|NO)\b[\s:;.#]*)?`;
// The next field glued to the ID: "2A6JBMI01/IC:28450-MI01", "APISB595MK2SUBIC:6132A-SB595MK2SUB".
// PaddleOCR often reads the I of "IC:" as 1 or l and drops the space: "PY3164003591C:4054A-16400359".
// IDs never contain a colon, so "1C:" can only be the IC field.
const IC_FIELD_RE = /[I1L|]C:/gi;
const GLUED_FIELD_RE = /(\/|[I1L|]C:).*$/i;
// First token after the label, and optionally a second token on the same line.
const TOKEN_RE = /^(\S+)(?:[ \t]+(\S+))?/;
// Words that start the next field on a label, never part of an FCC ID.
const STOP_WORDS = new Set(['IC', 'MODEL', 'CAN', 'ICES', 'SN', 'S/N', 'CMIIT', 'PN', 'P/N']);
// Heading words printed after "FCC ID" ("FCC ID Label and Location"), incl. OCR variants of LABEL.
// Only applied to tokens without digits; real all-letter IDs (e.g. RYYEYSHCN) are rare.
const HEADING_RE = /^(LA[BH]?E[LI]|LEBEL|LOCATION|STATEMENT|NUMBER|SIZE|SERIAL|ONLY|WILL)/;

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

// Grantee codes are 3 characters starting with a letter, or 5 starting with "2",
// and never contain the digits 0 or 1. So a 0 or 1 there is a misread O or I.
export function fixGrantee(id: string): string {
  const asLetter = (c: string) => (c === '0' ? 'O' : c === '1' ? 'I' : c);
  const len = id[0] === '2' ? 5 : 3;
  const head = id.slice(0, len);
  if (head.includes('-')) return id;
  return [...head].map((c, i) => (len === 5 && i === 0 ? c : asLetter(c))).join('') + id.slice(len);
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

    const first = tok[1].replace(GLUED_FIELD_RE, '');
    let id = normalize(first);
    let consumed = first.length;
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
    // A shortened label is weaker evidence, so all-letter tokens after it are headings.
    if (!/\d/.test(id) && (m[2] || HEADING_RE.test(id))) continue;
    id = fixGrantee(id);
    if (!isPlausible(id) || seen.has(id)) continue;
    seen.add(id);
    const raw = text.slice(m.index, start + consumed).replace(/\s+/g, ' ').trim();
    found.push({ id, source: m[1] ? 'module' : 'label', raw });
  }
  return found;
}

// An uppercase word with a valid grantee code (taken as printed, no 0/1 fixes) and a digit.
// Ends at punctuation, a space, or where a capitalised word starts ("PKRNVWMIFI5792Label").
const BARE_RE = /(?<![A-Za-z0-9-])(?:[A-Z][A-Z2-9]{2}|2[A-Z][A-Z2-9]{3})-?[A-Z0-9-]{0,13}[A-Z0-9](?=$|[^A-Za-z0-9-]|[A-Z][a-z])/g;

// IDs printed without an "FCC ID" label: bare on the label, in a heading, or with the label
// misread ("CID: 2BCGWXE75"). Much weaker evidence than findCandidates, so only meant as a
// fallback when that finds nothing, each confirmed by an exact fccid.io match.
export function findBareCandidates(text: string, max = 5): string[] {
  const found = new Set<string>();
  for (const [word] of text.replace(IC_FIELD_RE, ' IC: ').matchAll(BARE_RE)) {
    const id = normalize(word);
    if (id.length < 6 || !/\d/.test(id) || found.has(id)) continue;
    found.add(id);
    if (found.size === max) break;
  }
  return [...found];
}
