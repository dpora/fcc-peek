import Ocr from '@gutenye/ocr-browser';

const assets = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, location.href).href;

let ocrPromise: Promise<Ocr> | null = null;

function getOcr(): Promise<Ocr> {
  ocrPromise ??= Ocr.create({
    models: {
      detectionPath: assets('models/ch_PP-OCRv4_det_infer.onnx'),
      recognitionPath: assets('models/ch_PP-OCRv4_rec_infer.onnx'),
      dictionaryPath: assets('models/ppocr_keys_v1.txt'),
    },
  });
  return ocrPromise;
}

// PaddleOCR (PP-OCRv4), one line of text per detected line, as in the benchmark.
export async function recognize(image: Blob): Promise<string> {
  const url = URL.createObjectURL(image);
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
