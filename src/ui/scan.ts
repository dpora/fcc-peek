import { h } from '../dom';
import { findBareCandidates, findCandidates } from '../fccId';
import { lookup } from '../fccidio';
import { formatWhen, loadRecent } from '../recent';
import { resolveScan } from '../resolve';
import { resultsHash } from '../route';
import { scanState } from '../store';
import { BOX_ASPECT, BOX_WIDTH, boxInFrame, OCR_WIDTH } from '../viewfinder';
import { describeError } from './errors';
import { helpButton } from './help';

// The last few devices looked up; nothing at all until there is one. The section takes the
// space left above the buttons and scrolls its list; when not even one whole card fits there,
// it is hidden ("cut") instead of showing a sliver. Returns the section and a cleanup.
function recentScans(): { section: HTMLElement; stop: () => void } | null {
  const recent = loadRecent();
  if (recent.length === 0) return null;
  const now = Date.now();
  const list = h('div', { class: 'sugg' },
    ...recent.map((r) => {
      const details = [r.applicant, r.product].filter(Boolean).join(' · ');
      return h('a', { class: 'item', href: resultsHash(r.fccId) },
        h('span', { class: 'id' }, r.fccId),
        details ? h('span', {}, details) : null,
        h('span', { class: 'meta' }, formatWhen(r.scannedAt, now)));
    }));
  const section = h('section', { class: 'recent', 'aria-labelledby': 'recent-title' },
    h('h2', { id: 'recent-title' }, 'Recent scans'), list);

  // The section's size comes from the layout, not its content (flex-basis 0), and a cut section
  // keeps its layout (visibility: hidden), so measuring here is stable either way.
  const first = list.firstElementChild as HTMLElement;
  const fit = () => {
    const space = section.getBoundingClientRect();
    const needed = list.getBoundingClientRect().top - space.top + first.getBoundingClientRect().height;
    section.classList.toggle('cut', needed > space.height + 0.5);
  };
  const observer = new ResizeObserver(fit);
  observer.observe(section);
  observer.observe(first);
  return { section, stop: () => observer.disconnect() };
}

export function renderScan(view: HTMLElement): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;

  const video = h('video', { playsinline: '', muted: '', autoplay: '' }) as HTMLVideoElement;
  video.muted = true; // iOS only autoplays inline video when the muted property is set
  // The captured frame, shown in place of the live video while it is read.
  const still = h('canvas', { hidden: '' }) as HTMLCanvasElement;
  const frame = h('div', { class: 'viewfinder', style: `--box-width: ${BOX_WIDTH}; --box-aspect: ${BOX_ASPECT}` },
    video, still, h('div', { class: 'box' }));
  const capture = h('button', { class: 'primary', disabled: '' }, 'Capture') as HTMLButtonElement;
  // No `capture` attribute: with it, iOS opens the camera directly instead of offering the photo
  // library. Without it the picker offers Photo Library, Take Photo and Choose File.
  const file = h('input', { type: 'file', accept: 'image/*' }) as HTMLInputElement;
  const pick = h('label', { class: 'button' }, 'Choose photo', file);
  const status = h('p', { class: 'status' }, 'Fit the "FCC ID" line inside the box.');

  const recent = recentScans();
  view.classList.add('scan');
  view.append(
    h('header', { class: 'title-row' }, h('h1', {}, 'FCC Peek'), ...helpButton()),
    status,
    frame,
    recent?.section ?? '',
    h('div', { class: 'row end actions' }, pick, capture),
  );

  function cameraUnavailable(): void {
    frame.hidden = true;
    capture.hidden = true;
    status.textContent = 'Camera unavailable here. Choose a photo of the label.';
  }

  // Dev only: ?fakecam swaps the camera for a generated feed (src/devCamera.ts). The build
  // replaces import.meta.env.DEV with false, which drops this branch and the module with it.
  const fake = import.meta.env.DEV && new URLSearchParams(location.search).has('fakecam');
  const openCamera = (): Promise<MediaStream> =>
    fake
      ? import('../devCamera').then((m) => m.fakeCameraStream(m.fakeCameraSource(location.search)!))
      : navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });

  if (fake || typeof navigator.mediaDevices?.getUserMedia === 'function') {
    openCamera()
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
    status.className = 'status';
    status.textContent = 'Reading label…';
    try {
      // Usually already loaded by the preload in main.ts (OCR code ~11 MB, model ~25 MB).
      const { recognize, isOcrReady } = await import('../ocr');
      if (!isOcrReady()) status.textContent = 'Reading label… (still downloading the OCR model, about 25 MB)';
      const text = await recognize(image);
      if (stopped) return;
      if (!text.trim()) {
        fail("Couldn't read any text. Try again closer, with better light.");
        return;
      }
      const labelled = findCandidates(text).map((c) => c.id);
      status.textContent = labelled.length ? `Read ${labelled[0]}. Checking fccid.io…` : 'Checking fccid.io…';
      let resolution;
      try {
        resolution = await resolveScan(labelled, findBareCandidates(text), (id) => lookup(id));
      } catch (err) {
        if (stopped) return;
        fail(describeError(err, labelled[0] ?? '', navigator.onLine).message);
        return;
      }
      if (stopped) return;
      scanState.text = text;
      scanState.resolution = resolution;
      if (resolution.kind === 'found') location.hash = resultsHash(resolution.device.fccId);
      else location.hash = resolution.read ? resultsHash(resolution.read) : '#/not-found';
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

    // OCR only what is under the box, shrunk to OCR_WIDTH. Chosen photos are never cropped:
    // they were taken without the box.
    const scale = Math.min(1, OCR_WIDTH / box.width);
    const crop = document.createElement('canvas');
    crop.width = Math.round(box.width * scale);
    crop.height = Math.round(box.height * scale);
    const ctx = crop.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(still, box.x, box.y, box.width, box.height, 0, 0, crop.width, crop.height);
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
    recent?.stop();
  };
}
