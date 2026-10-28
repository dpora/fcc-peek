// The scan screen's viewfinder: a centred 3:1 box, 88% of the preview width.
// Sizes chosen by the viewfinder benchmark (docs/ocr-research, 2026-10-24).
export const BOX_WIDTH = 0.88;
export const BOX_ASPECT = 3;
// Extra margin cut around the box, as a fraction of the box width, on each side.
const MARGIN = 0.05;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The part of the video frame under the box (+margin), for a preview element of
// elW x elH showing a vidW x vidH frame with object-fit: cover.
export function boxInFrame(elW: number, elH: number, vidW: number, vidH: number): Rect {
  const scale = Math.max(elW / vidW, elH / vidH);
  const offsetX = (elW - vidW * scale) / 2;
  const offsetY = (elH - vidH * scale) / 2;

  const boxW = elW * BOX_WIDTH;
  const boxH = boxW / BOX_ASPECT;
  const m = boxW * MARGIN;
  const left = (elW - boxW) / 2 - m;
  const top = (elH - boxH) / 2 - m;

  const x0 = Math.max(0, (left - offsetX) / scale);
  const y0 = Math.max(0, (top - offsetY) / scale);
  const x1 = Math.min(vidW, (left + boxW + 2 * m - offsetX) / scale);
  const y1 = Math.min(vidH, (top + boxH + 2 * m - offsetY) / scale);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}
