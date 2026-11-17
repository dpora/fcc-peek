import { findCandidates } from './fccId';

// Reads a label photo, and reads it again turned 180° when the upright read finds no "FCC ID"
// line: the recognizer only reads upright text, so an upside-down label comes back as junk.
// `read(upsideDown)` runs the OCR; `onRetry` is told before the second read (it takes as long
// again). When neither read has a labelled ID, both texts are kept (upright first), so an ID
// printed without the "FCC ID" prefix can still be found either way up.
export async function readLabel(read: (upsideDown: boolean) => Promise<string>, onRetry?: () => void): Promise<string> {
  const upright = await read(false);
  if (findCandidates(upright).length > 0) return upright;
  onRetry?.();
  const turned = await read(true);
  if (findCandidates(turned).length > 0) return turned;
  return [upright, turned].filter((t) => t.trim()).join('\n');
}
