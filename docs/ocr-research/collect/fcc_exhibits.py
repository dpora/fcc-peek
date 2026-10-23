"""Build a large OCR test set from FCC "Label" exhibits on fccid.io.

For each sampled device: download its first Label exhibit PDF, render the page that
carries the FCC ID, and write a phone-photo-like degraded copy.

Output (gitignored, third-party images): tests/fcc_exhibits/
  pdf/<ID>.pdf  clean/<ID>.png  degraded/<ID>.jpg  manifest.json

Usage: python -I fcc_exhibits.py [--target 500] [--per-grantee 2] [--searches 25] [--out DIR]
Needs: pymupdf, pillow, numpy, and curl on PATH (Python/Node HTTP clients get Cloudflare 403s).
Resumable: every HTTP response is cached under <out>/raw/.
"""
import argparse
import hashlib
import json
import random
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageEnhance, ImageFilter

BASE = 'https://fccid.io'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
DPI = 150


def fetch(url: str, cache: Path, binary=False) -> tuple[int, bytes]:
    if cache.exists():
        data = cache.read_bytes()
        return int(data[:3]), data[4:]
    for attempt in range(4):
        time.sleep(1.0)
        out = subprocess.run(
            ['curl', '-s', '-L', '-A', UA, '-H', 'Accept: */*' if binary else 'Accept: text/html',
             '-w', '\n%{http_code}', url],
            capture_output=True, timeout=120,
        ).stdout
        cut = out.rfind(b'\n')
        status, body = int(out[cut + 1:] or 0), out[:cut]
        if status in (403, 429, 0):
            print(f'  {status} on {url}, backing off', file=sys.stderr)
            time.sleep(30 * (attempt + 1))
            continue
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(b'%03d\n' % status + body)
        return status, body
    return status, b''


def slug(url: str) -> str:
    return re.sub(r'[^A-Za-z0-9._-]', '_', url.removeprefix(BASE + '/'))[:150]


def flat(s: str) -> str:
    return re.sub(r'[\s-]', '', s.upper())


def find_id(page, fcc_id: str):
    """Bounding box of the ID in the page's text layer, or None."""
    want = flat(fcc_id)
    words = page.get_text('words')  # (x0, y0, x1, y1, text, ...)
    for i in range(len(words)):
        joined, box = '', None
        for w in words[i:i + 4]:  # an ID may be split into up to 4 words
            joined += flat(w[4])
            r = pymupdf.Rect(w[:4])
            box = r if box is None else box | r
            if want in joined:
                return box
            if not want.startswith(joined[:len(want)]) and want not in joined:
                break
    return None


def render_page(pdf: Path, fcc_id: str) -> tuple[Image.Image, int, bool]:
    """Close-up around the ID if the text layer has it (verified), else page 1 whole (unverified)."""
    doc = pymupdf.open(pdf)
    for i, page in enumerate(doc):
        box = find_id(page, fcc_id)
        if box:
            # Roughly what a phone photo of the label frames: a few ID-widths around it.
            pad_x, pad_y = max(box.width * 1.2, 120), max(box.height * 8, 90)
            clip = pymupdf.Rect(box.x0 - pad_x, box.y0 - pad_y, box.x1 + pad_x, box.y1 + pad_y) & page.rect
            pix = page.get_pixmap(dpi=300, clip=clip)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            break
    else:
        i = 0
        pix = doc[0].get_pixmap(dpi=DPI)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    if max(img.size) > 2400:
        img.thumbnail((2400, 2400))
    return img, i, box is not None


def perspective_coeffs(src, dst):
    a = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    return np.linalg.solve(np.array(a, float), np.array(src, float).reshape(8)).tolist()


def degrade(img: Image.Image, seed: int) -> tuple[Image.Image, dict]:
    """Simulated phone photo: tilt, rotation, lighting, glare, blur, noise, low res, JPEG."""
    rnd = random.Random(seed)
    w, h = img.size
    p = {
        'tilt': round(rnd.uniform(0.02, 0.07), 3),
        'rotate': round(rnd.uniform(-6, 6), 1),
        'brightness': round(rnd.uniform(0.7, 1.2), 2),
        'contrast': round(rnd.uniform(0.7, 1.1), 2),
        'glare': round(rnd.uniform(0.2, 0.55), 2),
        'blur': round(rnd.uniform(0.6, 1.6), 2),
        'noise': round(rnd.uniform(3, 9), 1),
        'scale': round(rnd.uniform(0.45, 0.75), 2),
        'jpeg': rnd.randint(45, 75),
    }
    j = lambda: rnd.uniform(0, p['tilt'])
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(w * j(), h * j()), (w * (1 - j()), h * j()), (w * (1 - j()), h * (1 - j())), (w * j(), h * (1 - j()))]
    bg = tuple(rnd.randint(90, 200) for _ in range(3))
    out = img.transform((w, h), Image.PERSPECTIVE, perspective_coeffs(src, dst), Image.BICUBIC, fillcolor=bg)
    out = out.rotate(p['rotate'], Image.BICUBIC, expand=True, fillcolor=bg)
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
    out = out.resize((max(1, int(out.width * p['scale'])), max(1, int(out.height * p['scale']))), Image.LANCZOS)
    return out, p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--target', type=int, default=500)
    ap.add_argument('--per-grantee', type=int, default=2)
    ap.add_argument('--searches', type=int, default=25)
    ap.add_argument('--out', default=str(Path(__file__).resolve().parents[3] / 'tests' / 'fcc_exhibits'))
    args = ap.parse_args()
    out = Path(args.out)
    raw = out / 'raw'
    for d in ('pdf', 'clean', 'degraded'):
        (out / d).mkdir(parents=True, exist_ok=True)
    man_path = out / 'manifest.json'
    manifest = json.loads(man_path.read_text()) if man_path.exists() else {}

    # Grantees with filings: collected from fccid.io search pages for random 3-digit numbers
    # (each lists ~50 devices whose product code contains it, across many companies).
    # The /grantees index is no use: it lists newly registered codes, most with no filings yet.
    rnd = random.Random(42)
    found: set[str] = set()
    for q in rnd.sample(range(100, 1000), args.searches):
        _, html = fetch(f'{BASE}/{q}', raw / f'search_{q}.html')
        for m in re.findall(rb'<a href="/([A-Z0-9][A-Z0-9-]{3,18})">', html):
            i = m.decode()
            found.add(i[:5] if i[0] == '2' else i[:3])
    grantees = sorted(found)
    rnd.shuffle(grantees)
    print(f'{len(grantees)} grantees', file=sys.stderr)

    picks: list[tuple[str, str]] = []
    for g in grantees:
        _, gh = fetch(f'{BASE}/{g}', raw / f'grantee_{g}.html')
        ids = sorted(set(m.decode() for m in re.findall(rb'href="/(' + re.escape(g.encode()) + rb'[A-Z0-9-]+)"', gh)))
        ids = [i for i in ids if '/' not in i]
        picks += [(g, i) for i in rnd.sample(ids, min(args.per_grantee, len(ids)))]
    print(f'{len(picks)} candidate devices', file=sys.stderr)

    skipped = {'no-label': 0, 'bad-pdf': 0}
    for g, fcc_id in picks:
        if sum(1 for v in manifest.values()) >= args.target:
            break
        if fcc_id in manifest:
            continue
        status, dh = fetch(f'{BASE}/{fcc_id}', raw / f'device_{slug(fcc_id)}.html')
        title = re.search(rb'<title>FCC ID (\S+)', dh)
        label = re.search(rb'href="(/' + re.escape(fcc_id.encode()) + rb'/Label/[^"]+)"', dh)
        if status != 200 or not title or not label:
            skipped['no-label'] += 1
            continue
        canonical = title.group(1).decode()
        exhibit = BASE + label.group(1).decode()
        pdf = out / 'pdf' / f'{canonical}.pdf'
        status, body = fetch(exhibit + '.pdf', raw / f'pdf_{slug(exhibit)}.bin', binary=True)
        if status != 200 or not body.startswith(b'%PDF'):
            skipped['bad-pdf'] += 1
            continue
        pdf.write_bytes(body)
        try:
            img, page_no, verified = render_page(pdf, canonical)
            if min(img.size) < 32:
                raise ValueError(f'image too small {img.size}')
            seed = int(hashlib.sha1(canonical.encode()).hexdigest()[:8], 16)
            bad, params = degrade(img, seed)
            img.save(out / 'clean' / f'{canonical}.png')
            bad.save(out / 'degraded' / f'{canonical}.jpg', quality=params['jpeg'])
        except Exception as e:  # malformed PDF or degenerate page
            print(f'  render failed {canonical}: {e}', file=sys.stderr)
            skipped['bad-pdf'] += 1
            continue
        manifest[canonical] = {
            'grantee': g, 'exhibit': exhibit, 'page': page_no + 1,
            'idInTextLayer': verified, 'size': img.size, 'degrade': params,
        }
        man_path.write_text(json.dumps(manifest, indent=1))
        print(f'{len(manifest):4d} {canonical} page {page_no + 1} verified={verified}', file=sys.stderr)

    print(f'done: {len(manifest)} devices, skipped {skipped}', file=sys.stderr)


if __name__ == '__main__':
    main()
