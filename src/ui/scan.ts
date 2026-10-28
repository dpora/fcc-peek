import { h } from '../dom';
import { findCandidates } from '../fccId';
import { recognize } from '../ocr';
import { scanState } from '../store';
import { boxInFrame } from '../viewfinder';
import { idForm } from './idForm';

export function renderScan(view: HTMLElement): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;

  const video = h('video', { playsinline: '', muted: '', autoplay: '' }) as HTMLVideoElement;
  video.muted = true; // iOS only autoplays inline video when the muted property is set
  // The captured frame, shown in place of the live video while it is read.
  const still = h('canvas', { hidden: '' }) as HTMLCanvasElement;
  const frame = h('div', { class: 'viewfinder' }, video, still, h('div', { class: 'box' }));
  const capture = h('button', { class: 'primary', disabled: '' }, 'Capture') as HTMLButtonElement;
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment' }) as HTMLInputElement;
  const pick = h('label', { class: 'button' }, 'Choose photo', file);
  const status = h('p', { class: 'status' }, 'Fit the "FCC ID" line inside the box.');

  view.append(
    h('h1', {}, 'FCC Peek'),
    frame,
    h('div', { class: 'row' }, capture, pick),
    status,
    h('h2', {}, 'Or type the FCC ID'),
    idForm(''),
  );

  function cameraUnavailable(): void {
    frame.hidden = true;
    capture.hidden = true;
    status.textContent = 'Camera unavailable here. Choose a photo or type the ID.';
  }

  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        capture.disabled = false;
      })
      .catch(cameraUnavailable);
  } else {
    cameraUnavailable();
  }

  function showLive(): void {
    still.hidden = true;
    video.hidden = false;
    if (stream) void video.play().catch(() => {});
  }

  function fail(message: string): void {
    status.textContent = message;
    status.className = 'error';
    showLive();
    capture.disabled = stream === null;
    file.disabled = false;
    file.value = '';
  }

  async function process(image: Blob): Promise<void> {
    capture.disabled = true;
    file.disabled = true;
    status.textContent = 'Reading label… (first run downloads the OCR model)';
    try {
      const text = await recognize(image, (p) => {
        status.textContent = `Reading label… ${Math.round(p * 100)}%`;
      });
      if (stopped) return;
      if (!text.trim()) {
        fail("Couldn't read any text. Try again closer, with better light, or type the ID.");
        return;
      }
      scanState.text = text;
      scanState.candidates = findCandidates(text);
      location.hash = '#/confirm';
    } catch (err) {
      if (stopped) return;
      fail(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  capture.addEventListener('click', () => {
    if (!video.videoWidth) return;
    still.width = video.videoWidth;
    still.height = video.videoHeight;
    still.getContext('2d')!.drawImage(video, 0, 0);
    // Measure before swapping: the still takes the video's place at the same size.
    const box = boxInFrame(video.clientWidth, video.clientHeight, still.width, still.height);
    video.pause();
    video.hidden = true;
    still.hidden = false;

    // OCR only what is under the box. Chosen photos are never cropped: they were taken without it.
    const crop = document.createElement('canvas');
    crop.width = box.width;
    crop.height = box.height;
    crop.getContext('2d')!.drawImage(still, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    crop.toBlob((blob) => {
      if (blob) void process(blob);
    }, 'image/png');
  });

  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) void process(f);
  });

  return () => {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
  };
}
