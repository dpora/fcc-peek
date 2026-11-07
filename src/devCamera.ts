// Development only: a fake camera for testing the Scan screen on a desktop.
//   ?fakecam              a generated device label (FCC ID BCG-E3175A, a real device)
//   ?fakecam=<image URL>  any image, e.g. a file in public/ or /@fs/C:/path/to/label.jpg
// scan.ts only imports this behind import.meta.env.DEV, so production builds leave it out.

export type FakeCameraSource = { kind: 'label' } | { kind: 'image'; url: string };

export function fakeCameraSource(search: string): FakeCameraSource | null {
  const value = new URLSearchParams(search).get('fakecam');
  if (value === null) return null;
  return value ? { kind: 'image', url: value } : { kind: 'label' };
}

// 4:3 like a typical rear camera, so the viewfinder (object-fit: cover, 4:3) shows all of it.
const WIDTH = 1280;
const HEIGHT = 960;

function drawLabel(ctx: CanvasRenderingContext2D): void {
  // Dark device casing with a pale sticker; the "FCC ID" line sits on the centre line,
  // which is where the viewfinder box is.
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#2b2f36');
  bg.addColorStop(1, '#121417');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#e9e7e1';
  ctx.beginPath();
  ctx.roundRect(160, 250, 960, 460, 16);
  ctx.fill();

  ctx.fillStyle = '#16181c';
  ctx.textBaseline = 'middle';
  ctx.font = '500 52px ui-monospace, Consolas, monospace';
  ctx.fillText('Model A1901', 220, 330);
  ctx.font = '700 72px ui-monospace, Consolas, monospace';
  ctx.fillText('FCC ID: BCG-E3175A', 220, HEIGHT / 2);
  ctx.font = '500 52px ui-monospace, Consolas, monospace';
  ctx.fillText('IC: 579C-E3175A', 220, 630);

  // Outside the viewfinder box, so it is never read by OCR.
  ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText('FAKE CAMERA (dev)', 24, 40);
}

async function drawImage(ctx: CanvasRenderingContext2D, url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  await img.decode();
  // Cover-fit, like the real viewfinder does with the camera picture.
  const scale = Math.max(WIDTH / img.naturalWidth, HEIGHT / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

export async function fakeCameraStream(source: FakeCameraSource): Promise<MediaStream> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  if (source.kind === 'image') await drawImage(ctx, source.url);
  else drawLabel(ctx);

  const stream = canvas.captureStream(15);
  const [track] = stream.getVideoTracks();
  // A canvas stream only sends frames when the canvas is painted, so keep repainting a pixel
  // until the scan screen stops the track.
  const pixel = ctx.getImageData(0, 0, 1, 1);
  const timer = setInterval(() => {
    if (track.readyState === 'ended') clearInterval(timer);
    else ctx.putImageData(pixel, 0, 0);
  }, 1000 / 15);
  return stream;
}
