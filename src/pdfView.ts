// Legacy build: the modern one calls Promise.try, Map#getOrInsertComputed and Math.sumPrecise
// unpolyfilled, and on phones without them getDocument() hangs forever instead of rejecting.
import { getDocument, GlobalWorkerOptions, ImageKind, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { h } from './dom';

GlobalWorkerOptions.workerSrc = workerUrl;

// Copied into public/pdfjs by scripts/copy-ocr-assets.mjs. Absolute, because the worker
// resolves them. Without wasmUrl pdf.js drops JPEG 2000 images and draws pages without photos.
const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, document.baseURI).href;

// pages: each page drawn whole. images: only the pictures embedded in the pages, at their own
// resolution (the photos in an Internal Photos exhibit, without the page around them).
export type PdfMode = 'pages' | 'images';

// Smaller pictures are logos, letterheads and icons, not photos.
const MIN_IMAGE_SIDE = 150;
// Long side cap for an extracted picture (a full 24 MP scan would exhaust memory on a phone).
const MAX_IMAGE_SIDE = 3000;

// onPageCount: called once the page count is known (the viewer's "Page 1 of N").
// Returns how many pictures it showed (pages, or images in images mode).
export async function renderPdf(url: string, container: HTMLElement, onPageCount?: (n: number) => void, mode: PdfMode = 'pages'): Promise<number> {
  const task = getDocument({
    url,
    disableRange: true,
    disableStream: true,
    wasmUrl: `${assets}wasm/`,
    standardFontDataUrl: `${assets}standard_fonts/`,
  });
  let shown = 0;
  try {
    const pdf = await task.promise;
    onPageCount?.(pdf.numPages);
    const seen = new Set<string>();
    for (let i = 1; i <= pdf.numPages; i++) {
      if (!container.isConnected) break;
      const page = await pdf.getPage(i);
      const canvases = mode === 'images' ? await pageImages(page, seen) : [await drawPage(page, columnWidth(container))];
      page.cleanup();
      for (const [k, canvas] of canvases.entries()) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        canvas.width = canvas.height = 0;
        if (!blob || !container.isConnected) continue;
        const src = URL.createObjectURL(blob);
        const alt = mode === 'images' ? `Page ${i}, image ${k + 1}` : `Page ${i}`;
        container.append(h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt, 'data-page': String(i) })));
        shown++;
      }
    }
  } finally {
    await task.destroy();
  }
  return shown;
}

// The CSS width one page is shown at: a grid column when the pages are laid out side by side.
function columnWidth(container: HTMLElement): number {
  const track = parseFloat(getComputedStyle(container).gridTemplateColumns);
  return Math.min(Number.isFinite(track) && track > 0 ? track : container.clientWidth || 800, 1200);
}

async function drawPage(page: PDFPageProxy, cssWidth: number): Promise<HTMLCanvasElement> {
  const targetWidth = cssWidth * Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: targetWidth / page.getViewport({ scale: 1 }).width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

interface ImageData_ {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
}

// The pictures a page paints, each once per document (`seen`), skipping small ones.
async function pageImages(page: PDFPageProxy, seen: Set<string>): Promise<HTMLCanvasElement[]> {
  const ops = await page.getOperatorList();
  const ids: string[] = [];
  ops.fnArray.forEach((fn, i) => {
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintImageXObjectRepeat) return;
    const id = ops.argsArray[i][0];
    if (typeof id === 'string' && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });
  const out: HTMLCanvasElement[] = [];
  for (const id of ids) {
    const objs = id.startsWith('g_') ? page.commonObjs : page.objs;
    // Resolved by the time the operator list is; the callback form also waits if it isn't.
    const img = await new Promise<ImageData_ | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      objs.get(id, (data: ImageData_ | null) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
    if (!img || Math.min(img.width, img.height) < MIN_IMAGE_SIDE) continue;
    const canvas = toCanvas(img);
    if (canvas) out.push(canvas);
  }
  return out;
}

function toCanvas(img: ImageData_): HTMLCanvasElement | null {
  const { width, height } = img;
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  const ctx = full.getContext('2d');
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const rgba = ctx.createImageData(width, height);
    const src = img.data;
    const dst = rgba.data;
    if (img.kind === ImageKind.RGBA_32BPP) {
      dst.set(src.subarray(0, dst.length));
    } else if (img.kind === ImageKind.RGB_24BPP) {
      for (let s = 0, d = 0; d < dst.length; s += 3, d += 4) {
        dst[d] = src[s];
        dst[d + 1] = src[s + 1];
        dst[d + 2] = src[s + 2];
        dst[d + 3] = 255;
      }
    } else if (img.kind === ImageKind.GRAYSCALE_1BPP) {
      // One bit per pixel, rows padded to whole bytes; a set bit is white (as pdf.js draws it).
      const rowBytes = (width + 7) >> 3;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const v = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
          const d = (y * width + x) * 4;
          dst[d] = dst[d + 1] = dst[d + 2] = v;
          dst[d + 3] = 255;
        }
    } else {
      return null;
    }
    ctx.putImageData(rgba, 0, 0);
  } else {
    return null;
  }
  const long = Math.max(width, height);
  if (long <= MAX_IMAGE_SIDE) return full;
  const s = MAX_IMAGE_SIDE / long;
  const small = document.createElement('canvas');
  small.width = Math.round(width * s);
  small.height = Math.round(height * s);
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(full, 0, 0, small.width, small.height);
  full.width = full.height = 0;
  return small;
}
