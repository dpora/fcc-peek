"""Simulate the scan-screen viewfinder on the FCC label-exhibit set (built by fcc_exhibits.py).

For each "checked" exhibit (ID in the text layer, so its position is known): render a 1080x1920
portrait camera frame, aimed so the "FCC ID: ..." text sits inside a centred box 88% of the screen
wide, then cut the box (+5% margin) at 2:1, 3:1 and 4:1. A degraded copy (rotation, lighting,
glare, noise, blur, low res, JPEG) is made of the frame first, then cropped the same way.
Also writes a centred 3:1 crop of each real photo in tests/example_images.

Output (gitignored): tests/fcc_exhibits/viewfinder/<variant>/<ID>.png|jpg, manifest.json
Usage: python -I viewfinder.py
"""
import json
import random
import re
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageEnhance, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fcc_exhibits import find_id  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
SRC = REPO / 'tests' / 'fcc_exhibits'
OUT = SRC / 'viewfinder'
FW, FH = 1080, 1920  # portrait camera frame
BOX_W = 0.88  # viewfinder width, fraction of frame width
ASPECTS = (2, 3, 4)
MARGIN = 0.05  # of box width, each side


def target_box(page, idbox):
    """ID box plus the nearest "FCC" word (and the word after it) on the same line or just above."""
    words = page.get_text('words')
    h = idbox.height
    best = None
    for k, w in enumerate(words):
        r = pymupdf.Rect(w[:4])
        if 'FCC' not in w[4].upper() or r.y0 < idbox.y0 - 4 * h or r.y1 > idbox.y1 + h:
            continue
        if r.x0 > idbox.x1 or r.x1 < idbox.x0 - 3 * idbox.width:
            continue
        d = abs(r.y0 - idbox.y0) + abs(r.x0 - idbox.x0) * 0.1
        if best is None or d < best[0]:
            best = (d, k)
    box = pymupdf.Rect(idbox)
    if best:
        k = best[1]
        box |= pymupdf.Rect(words[k][:4])
        nxt = words[k + 1] if k + 1 < len(words) else None
        if nxt and nxt[5:7] == words[k][5:7] and pymupdf.Rect(nxt[:4]).x1 <= idbox.x1:
            box |= pymupdf.Rect(nxt[:4])
    return box, best is not None


def render_frame(page, target, rnd):
    """Camera frame aimed so `target` fits the 3:1 box; returns image and box rect in pixels."""
    fill = rnd.uniform(0.45, 0.85)
    bw = max(target.width / fill, target.height * 3 / 0.8)  # box width in points
    bh = bw / 3
    bx0 = target.x0 - rnd.uniform(0, bw - target.width)
    by0 = target.y0 - rnd.uniform(0, max(0, bh - target.height))
    cx, cy = bx0 + bw / 2, by0 + bh / 2
    fw = bw / BOX_W
    fh = fw * FH / FW
    frame = pymupdf.Rect(cx - fw / 2, cy - fh / 2, cx + fw / 2, cy + fh / 2)
    scale = FW / fw
    canvas = Image.new('RGB', (FW, FH), 'white')
    clip = frame & page.rect
    if not clip.is_empty:
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        canvas.paste(img, (round((clip.x0 - frame.x0) * scale), round((clip.y0 - frame.y0) * scale)))
    return canvas, {'fill': round(fill, 2), 'scale': round(scale, 2)}


def crop_box(w, h, aspect):
    """Viewfinder box (+margin) for a frame of size w x h, centred."""
    bw = BOX_W * w
    bh = bw / aspect
    m = MARGIN * bw
    cx, cy = w / 2, h / 2
    return tuple(round(v) for v in (cx - bw / 2 - m, cy - bh / 2 - m, cx + bw / 2 + m, cy + bh / 2 + m))


def degrade(img, seed):
    """Photometric phone-photo damage, same ranges as fcc_exhibits.degrade, plus rotation about the centre."""
    rnd = random.Random(seed)
    p = {
        'rotate': round(rnd.uniform(-6, 6), 1),
        'brightness': round(rnd.uniform(0.7, 1.2), 2),
        'contrast': round(rnd.uniform(0.7, 1.1), 2),
        'glare': round(rnd.uniform(0.2, 0.55), 2),
        'blur': round(rnd.uniform(0.6, 1.6), 2),
        'noise': round(rnd.uniform(3, 9), 1),
        'scale': round(rnd.uniform(0.45, 0.75), 2),
        'jpeg': rnd.randint(45, 75),
    }
    bg = tuple(rnd.randint(90, 200) for _ in range(3))
    out = img.rotate(p['rotate'], Image.BICUBIC, expand=False, fillcolor=bg)
    out = ImageEnhance.Brightness(out).enhance(p['brightness'])
    out = ImageEnhance.Contrast(out).enhance(p['contrast'])
    a = np.asarray(out, float)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    cx, cy, r = rnd.uniform(0.2, 0.8) * a.shape[1], rnd.uniform(0.2, 0.8) * a.shape[0], rnd.uniform(0.15, 0.4) * max(a.shape)
    glare = p['glare'] * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r))
    a = a + (255 - a) * glare[..., None]
    a = a + np.random.default_rng(seed).normal(0, p['noise'], a.shape)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    out = out.filter(ImageFilter.GaussianBlur(p['blur']))
    out = out.resize((round(out.width * p['scale']), round(out.height * p['scale'])), Image.LANCZOS)
    return out, p


def main():
    manifest = json.loads((SRC / 'manifest.json').read_text(encoding='utf8'))
    variants = ['frame', 'frame_degraded'] + [f'crop{a}{d}' for a in ASPECTS for d in ('', '_degraded')]
    for v in variants + ['photos_crop3']:
        (OUT / v).mkdir(parents=True, exist_ok=True)
    out_man, skipped = {}, {'vertical': 0, 'not-found': 0}
    for cid, m in manifest.items():
        if not m['idInTextLayer']:
            continue
        page = pymupdf.open(SRC / 'pdf' / f'{cid}.pdf')[m['page'] - 1]
        idbox = find_id(page, cid)
        if idbox is None:
            skipped['not-found'] += 1
            continue
        if idbox.height > idbox.width:  # rotated print: the user would turn the phone; not simulated
            skipped['vertical'] += 1
            continue
        target, labelled = target_box(page, idbox)
        seed = int.from_bytes(cid.encode(), 'little') % (2**32)
        frame, params = render_frame(page, target, random.Random(seed))
        frame.save(OUT / 'frame' / f'{cid}.png')
        bad, dp = degrade(frame, seed)
        bad.save(OUT / 'frame_degraded' / f'{cid}.jpg', quality=dp['jpeg'])
        bad = Image.open(OUT / 'frame_degraded' / f'{cid}.jpg')  # crop the JPEG the camera would give
        for a in ASPECTS:
            frame.crop(crop_box(FW, FH, a)).save(OUT / f'crop{a}' / f'{cid}.png')
            bad.crop(crop_box(bad.width, bad.height, a)).save(OUT / f'crop{a}_degraded' / f'{cid}.png')
        out_man[cid] = {**params, 'labelInTarget': labelled, 'degrade': dp}
    photos = {}
    for folder in ('user_marked', 'wikimedia_commons', 'web_batch2'):
        for f in sorted((REPO / 'tests' / 'example_images' / folder).iterdir()):
            if f.suffix.lower() == '.json':
                continue
            img = Image.open(f).convert('RGB')
            name = f'{folder}__{f.stem}.png'
            img.crop(crop_box(img.width, img.height, 3)).save(OUT / 'photos_crop3' / name)
            photos[name] = {'folder': folder, 'id': f.stem}
    (OUT / 'manifest.json').write_text(json.dumps({'exhibits': out_man, 'photos': photos}, indent=1))
    print(f'{len(out_man)} exhibits, {len(photos)} photos, skipped {skipped}', file=sys.stderr)


if __name__ == '__main__':
    main()
