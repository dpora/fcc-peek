import { h } from '../dom';
import { findCandidates } from '../fccId';
import { recognize } from '../ocr';
import { scanState } from '../store';
import { idForm } from './idForm';

export function renderScan(view: HTMLElement): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;

  const video = h('video', { playsinline: '', muted: '', autoplay: '' }) as HTMLVideoElement;
  video.muted = true; // iOS only autoplays inline video when the muted property is set
  const capture = h('button', { class: 'primary', disabled: '' }, 'Capture') as HTMLButtonElement;
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment' }) as HTMLInputElement;
  const pick = h('label', { class: 'button' }, 'Choose photo', file);
  const status = h('p', { class: 'status' }, 'Point the camera at the label with "FCC ID".');

  view.append(
    h('h1', {}, 'FCC Peek'),
    video,
    h('div', { class: 'row' }, capture, pick),
    status,
    h('h2', {}, 'Or type the FCC ID'),
    idForm(''),
  );

  function cameraUnavailable(): void {
    video.hidden = true;
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

  async function process(image: Blob): Promise<void> {
    capture.disabled = true;
    file.disabled = true;
    status.textContent = 'Reading label… (first run downloads the OCR model)';
    try {
      const text = await recognize(image, (p) => {
        status.textContent = `Reading label… ${Math.round(p * 100)}%`;
      });
      if (stopped) return;
      scanState.text = text;
      scanState.candidates = findCandidates(text);
      location.hash = '#/confirm';
    } catch (err) {
      if (stopped) return;
      status.textContent = `OCR failed: ${err instanceof Error ? err.message : String(err)}`;
      status.className = 'error';
      capture.disabled = stream === null;
      file.disabled = false;
    }
  }

  capture.addEventListener('click', () => {
    if (!video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
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
