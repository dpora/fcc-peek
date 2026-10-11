import { createWorker, OEM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

const assets = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, location.href).href;

let workerPromise: Promise<Worker> | null = null;
let progressHandler: ((fraction: number) => void) | null = null;

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: assets('worker.min.js'),
    corePath: assets('core'),
    langPath: assets('lang'),
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') progressHandler?.(m.progress);
    },
  });
  return workerPromise;
}

export async function recognize(image: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  progressHandler = onProgress ?? null;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return data.text;
  } catch (err) {
    workerPromise = null;
    throw err;
  } finally {
    progressHandler = null;
  }
}
