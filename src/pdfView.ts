// Legacy build: the modern one calls Promise.try, Map#getOrInsertComputed and Math.sumPrecise
// unpolyfilled, and on phones without them getDocument() hangs forever instead of rejecting.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { h } from './dom';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdf(url: string, container: HTMLElement): Promise<void> {
  const task = getDocument({ url, disableRange: true, disableStream: true });
  try {
    const pdf = await task.promise;
    const cssWidth = Math.min(container.clientWidth || 800, 1200);
    const targetWidth = cssWidth * Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 1; i <= pdf.numPages; i++) {
      if (!container.isConnected) break;
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: targetWidth / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) continue;
      const src = URL.createObjectURL(blob);
      container.append(h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt: `Page ${i}` })));
    }
  } finally {
    await task.destroy();
  }
}
