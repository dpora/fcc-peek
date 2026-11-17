// Short, distinct labels for the viewer's document chips. fccid.io titles within one type tend
// to share a long start ("SAR Test Report-Annex A", "SAR Test Report-Annex B", ...) that the
// chip's ellipsis cuts to the same text, and some repeat exactly. Each label keeps only what
// tells the titles apart, with underscores read as spaces and exact repeats numbered.

const tidy = (t: string) => t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

// Separators a shared start may end on; the label starts after them.
const SEP = /[\s\-–—:,.()]/;

function sharedStart(titles: string[]): number {
  let n = 0;
  const first = titles[0];
  while (n < first.length && titles.every((t) => t[n]?.toLowerCase() === first[n].toLowerCase())) n++;
  // One title is the shared start itself (or they are all the same): nothing to cut.
  if (titles.some((t) => t.length === n)) return 0;
  // Back up to a separator so labels start on a whole word ("Annex A", not "nnex A").
  const back = () => {
    while (n > 0 && SEP.test(first[n - 1])) n--;
    while (n > 0 && !SEP.test(first[n - 1])) n--;
  };
  if (n > 0 && !SEP.test(first[n - 1])) back();
  // Keep a word of context when what's left is that short ("Annex A", "DSS-1", not "A", "1").
  while (n > 0 && Math.min(...titles.map((t) => t.length - n)) < 4) back();
  return n;
}

export function chipLabels(titles: string[], fallback: string): string[] {
  const clean = titles.map((t) => tidy(t) || fallback);
  let labels = clean;
  if (clean.length > 1) {
    const n = sharedStart(clean);
    const rest = clean.map((t) => t.slice(n).replace(/^[\s\-–—:,.]+/, '').trim());
    // Only cut when it leaves every title something, and something short enough to be worth it.
    if (n >= 4 && rest.every((r) => r.length > 0)) labels = rest;
  }
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const l of labels) total.set(l, (total.get(l) ?? 0) + 1);
  return labels.map((l) => {
    if (total.get(l)! < 2) return l;
    const k = (seen.get(l) ?? 0) + 1;
    seen.set(l, k);
    return `${l} (${k})`;
  });
}
