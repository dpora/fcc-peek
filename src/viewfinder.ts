// The scan screen's viewfinder: a centred 4:1 box, 88% of the preview width.
// The viewfinder benchmark (docs/ocr-research, 2026-10-24) scored 4:1 the same as 3:1 and a bit
// faster; it holds one "FCC ID: X" line but less tilt, and not a two-line "FCC ID" / ID label.
// The CSS box reads both numbers from here (--box-width, --box-aspect set in ui/scan.ts).
export const BOX_WIDTH = 0.88;
export const BOX_ASPECT = 4;
// PaddleOCR misreads large, sharp text (a final "1" as "-"); a crop ~480 px wide read best.
export const OCR_WIDTH = 480;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Exactly the part of the video frame under the box (no margin, so OCR reads what the user framed), for a preview element of
// elW x elH showing a vidW x vidH frame with object-fit: cover.
export function boxInFrame(elW: number, elH: number, vidW: number, vidH: number): Rect {
  const scale = Math.max(elW / vidW, elH / vidH);
  const offsetX = (elW - vidW * scale) / 2;
  const offsetY = (elH - vidH * scale) / 2;

  const boxW = elW * BOX_WIDTH;
  const boxH = boxW / BOX_ASPECT;
  const left = (elW - boxW) / 2;
  const top = (elH - boxH) / 2;

  const x0 = Math.max(0, (left - offsetX) / scale);
  const y0 = Math.max(0, (top - offsetY) / scale);
  const x1 = Math.min(vidW, (left + boxW - offsetX) / scale);
  const y1 = Math.min(vidH, (top + boxH - offsetY) / scale);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}
