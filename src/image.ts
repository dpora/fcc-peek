// OCR runs the text detector on every pixel it is given, and its memory grows with the pixel
// count: a 12 MP iPhone photo peaked at ~3.6 GB, far past what iOS Safari allows a tab, which
// then gets killed. Measured on 41 real label photos, a 1280 px long side reads FCC IDs as well
// as the full size (34/41 vs 33/41), peaks at ~0.8 GB and is ~35% faster.
export const MAX_OCR_SIDE = 1280;

// The size to shrink width x height to so its long side is `max`, or null if it already fits.
export function scaledSize(width: number, height: number, max: number): { width: number; height: number } | null {
  const long = Math.max(width, height);
  if (long <= max) return null;
  const s = max / long;
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

// Shrinks an image so its long side is at most `max`; returns it unchanged if it already fits.
// Decoded through an <img>, like the OCR library does, so EXIF rotation is applied the same way.
export async function downscale(image: Blob, max = MAX_OCR_SIDE): Promise<Blob> {
  const url = URL.createObjectURL(image);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = scaledSize(img.naturalWidth, img.naturalHeight, max);
    if (!size) return image;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    // Release the canvas memory now rather than at the next garbage collection (matters on iOS).
    canvas.width = canvas.height = 0;
    return blob ?? image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
