import Ocr from '@gutenye/ocr-browser';
import { downscale } from './image';

const assets = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, location.href).href;

let ocrPromise: Promise<Ocr> | null = null;
let ready = false;

function getOcr(): Promise<Ocr> {
  if (!ocrPromise) {
    const p = Ocr.create({
      models: {
        detectionPath: assets('models/ch_PP-OCRv4_det_infer.onnx'),
        recognitionPath: assets('models/ch_PP-OCRv4_rec_infer.onnx'),
        dictionaryPath: assets('models/ppocr_keys_v1.txt'),
      },
    });
    ocrPromise = p;
    p.then(
      () => (ready = true),
      () => {
        // Forget a failed download (e.g. offline) so the next scan or preload tries again.
        if (ocrPromise === p) ocrPromise = null;
      },
    );
  }
  return ocrPromise;
}

// Start downloading the model (~25 MB) in the background, so the first scan doesn't wait for it.
export function preloadOcr(): void {
  getOcr().catch(() => {});
}

export function isOcrReady(): boolean {
  return ready;
}

// PaddleOCR (PP-OCRv4), one line of text per detected line, as in the benchmark.
// Images are capped at MAX_OCR_SIDE first: a full-size phone photo runs iOS Safari out of memory.
export async function recognize(image: Blob): Promise<string> {
  const url = URL.createObjectURL(await downscale(image));
  try {
    const ocr = await getOcr();
    const { texts } = await ocr.detect(url);
    return texts.map((line) => line.text).join('\n');
  } catch (err) {
    ocrPromise = null;
    throw err;
  } finally {
    URL.revokeObjectURL(url);
  }
}
