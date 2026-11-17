# OCR research: reading FCC IDs from label photos

FCC Peek's job sounds simple: photograph a label, read the FCC ID, look it up. Reading a short
code off a dusty, glare-covered sticker at a thrift store is the hard part. This page covers how
we measured that, what we tried, what each change did to the numbers, and the decisions we made
along the way. The work ran through October and November 2026.

## Results at a glance

| Milestone | Real photos (65) | FCC label set (2000 images) |
|---|---|---|
| Starting point: Tesseract.js, default settings, take the first ID | 23 right | — |
| Switched to PaddleOCR (PP-OCRv4) | 50 right | — |
| + matcher fixes, fccid.io suggestions (`look1`), bare-ID fallback | **54 right, 0 wrong** | **1589 right (79%), 18 wrong (0.9%)** |
| Same pipeline on clean labels whose ID is in the PDF text layer | — | **495 / 512 (97%)** |

"Right" means the app ends up on the correct device page on fccid.io, not just that the OCR text
was correct. The lookup step can fix a misread (see [Using fccid.io's corrections](#4-using-fccidios-corrections)),
and it can also turn a misread into a confident wrong answer, so we counted wrong answers
separately and tried to keep them near zero. A wrong device is worse than "not found": the user
can't tell anything went wrong.

## Test data

We built three sets. None of the images are committed: the photos belong to their authors and the
FCC exhibits to the manufacturers. The scripts in `collect/` rebuild them.

### 1. Real photos (65 images)

Photos of real labels, the closest thing to what the app sees in use.

| Set | Count | Source |
|---|---|---|
| `user_marked/` | 13 | My own picks and photos. The hardest set: clutter, glare, low resolution. |
| `wikimedia_commons/` | 27 | Wikimedia Commons search for "FCC ID". |
| `web_batch2/` | 25 | Commons categories (Wi-Fi cards, keyboards, modules…) and one Flickr photo (CC BY). |

- Found with the `collect/search*.mjs` and `collect/cat.mjs` scripts (Commons and Openverse APIs;
  `cat.mjs` spreads picks across a category so we don't get ten shots of the same device), then
  downloaded and filed with `fetch.mjs` and `place*.mjs`.
- Each file is named after its FCC ID. Every ID was read by eye from the full image and checked on
  fccid.io. Three aren't on fccid.io at all (`PDD-AR5B93`, `PP2RX03031`, `I88RLG607N`, the last
  probably a label-maker mockup), which puts the ceiling at 62.
- Each folder has a `manifest.json` with source, author and license, needed for the CC BY-SA
  attribution.

Sixty-five photos is too few to tune against: an early Tesseract tuning pass scored well on
`user_marked` and worse on everything else. So we built a larger set.

### 2. FCC label exhibits (1000 devices, 2000 images)

Every FCC filing includes an "ID Label/Location Info" exhibit: a PDF showing the label and where it
goes. That's thousands of labels whose correct ID we already know.

- **Built by** `collect/fcc_exhibits.py` into `tests/fcc_exhibits/`.
- **Sampling.** fccid.io's `/grantees` index turned out to be useless (it lists newly registered
  company codes, mostly with no filings). Instead the script runs fccid.io searches for random
  3-digit numbers, collects the grantees on the result pages, and picks 2 random devices per
  grantee. First run: 25 searches, 500 devices from 243 grantees. Second run
  (`--target 1000 --searches 60`) kept the first 500 and added 500 more, for 493 grantees.
  Filings span 1998–2026.
- **Per device.** The first Label exhibit PDF:
  - If the PDF's text layer contains the ID (512 devices, "checked"), a 300-dpi crop around it.
  - Otherwise (488, "image only"), the whole first page at 150 dpi. These include real label
    photos, but also drawings with print too small to read.
- **Degraded copy.** Each image also gets a seeded, reproducible damaged copy: tilt, rotation,
  uneven lighting, glare, blur, noise, 45–75% scale and JPEG quality 45–75. This stands in for a
  bad phone photo.

### 3. Viewfinder simulation (498 frames)

To decide whether the scan screen should have a box to aim with, `collect/viewfinder.py` renders
the 498 checked exhibits with a horizontal ID into a 1080×1920 portrait "camera frame", as if the
user had lined the "FCC ID: …" line up with a centred box. The text fills a random 45–85% of the
box at a random offset. Each frame is then cut to the box at 2:1, 3:1 and 4:1, clean and degraded.

### Scoring without rerunning OCR

OCR is the slow part, so the bench scripts save the raw OCR text for every image and engine
(`*-texts.json`). `bench/suggest.mts` replays that text through the matcher and the fccid.io lookup
under several policies. A matcher change can be scored against all 2000 images in minutes.

## What we tried, in order

### 1. Tesseract → PaddleOCR

The app started on Tesseract.js, the obvious choice for in-browser OCR.

| Setup | user_marked (13) | commons (27) | batch2 (25) | Total (65) |
|---|---|---|---|---|
| Tesseract, default settings | 4 | 11 | 8 | 23 |
| Tesseract, tuned (grayscale, 1600 px, PSM 11, Sauvola threshold) | 9 | 11 | 5 | 25 |
| **PaddleOCR PP-OCRv4** | 10 | 22 | 18 | **50** |

The tuned Tesseract was overfitted to `user_marked` and lost ground elsewhere, so we dropped it.
PaddleOCR doubled the score untouched. On the 1000-device set the gap held: 79% vs about 40%.

The cost is size and speed. Paddle's models are about 16 MB (vs 3 MB for Tesseract), and the first
scan downloads about 25 MB including ONNX Runtime and OpenCV. It averaged 689 ms per image on a
desktop vs 281 ms for Tesseract. We took that trade: a fast wrong answer is no use, and the
viewfinder crop later made Paddle much faster.

OCR confidence scores turned out to be useless for spotting misreads: wrong reads scored 0.93–0.98.

### 2. Matcher fixes

Looking at the misses by eye, most weren't OCR failures. **Paddle had read the ID correctly in 15
of the 22 misses on clean labels**; the code that picks the ID out of the text (`src/fccId.ts`) was
missing it. Fixes, each driven by real failures:

| Problem | Example | Fix |
|---|---|---|
| Heading words taken as IDs | `FCC ID LABEL` (142 times), `LOCATION`, `NUMBER`, `ENTIFICATION` | Skip digit-free heading words and their OCR variants (`LAEL`); don't match `FCC IDENTIF…` |
| `Number`/`No.` before the ID | `FCCID.NO.BR98YV1764` | Skip them |
| Repeated punctuation | `FCC ID. : UJO-ZAMM-TM110` | Allow `[\s:;.#]*` after the label |
| Next field glued on | `…MK2SUBIC:6132A…`, `2A6JBMI01/IC:…` | Cut the token at `IC:` (or `1C:`) and `/` |
| Other label wording | `FCC Certification ID`, `FC ID`, `CC ID` | Accept them (the short forms only at a word start, so not "ACCIDENT") |
| `0`/`1` in the company code | `188RLG607N` | Read as `O`/`I` (see [FCC ID format rules](#fcc-id-format-rules)) |
| No "FCC ID" label at all | bare ID on the sticker, ID in a heading | Bare-ID fallback (below) |

The heading-word bug mattered more than it looked: fccid.io redirects some words to real,
unrelated devices (`LABEL` → `EA46GJLABEL`), so they became confident wrong answers. Before the
fixes the 1000-image run resolved 672 right and **79 wrong**; after, 732 right and **5 wrong**.

### 3. Bare-ID fallback

Seven clean misses had no "FCC ID" before the ID: it was printed alone, in a callout, or the OCR
mangled the label. `findBareCandidates` finds words that look like an FCC ID (valid company code, a
digit, at least 6 characters). To keep this from inventing answers it's a fallback only: used when
no labelled ID resolves, accepted only on an exact fccid.io match (never a suggestion or redirect),
and capped at 5 lookups. It added 48 right and 3 wrong on the 2000-image set.

### 4. Using fccid.io's corrections

fccid.io answers a lookup in several ways (details in [fccid.io behaviour](#fccidio-behaviour)).
Two are useful for fixing misreads:

- **300 "Possible Matches"**: a list of similar IDs. The original app treated this as an error and
  threw the best clue away.
- **303 redirect**: fccid.io corrects some misreads itself (`ESXKBM10510` → `E5XKBM10510`).

The question was how much to trust them. We compared policies using a weighted edit distance where
a look-alike swap (`0ODQ 1IL7 5S 8B 2Z 6G UV 4A`) costs 0.25 and any other edit 1:

| Policy | Paddle, real photos (right / wrong) | Paddle, 500 devices (1000 images) |
|---|---|---|
| exact page only | 51 / 0 | 754 / 5 |
| take fccid.io's first suggestion | 53 / **3** | 756 / **8** |
| look-alikes only (d ≤ 0.75) | 53 / 0 | 751 / 4 |
| **look-alikes + 1 real edit (d ≤ 1.25), `look1`** | **54 / 0** | 755 / 4 |
| only known OCR patterns (`ocr`) | 54 / 0 | 752 / 4 |
| **`look1` + bare-ID fallback** | **54 / 0** | **777 / 4** |

- Taking the first suggestion is unsafe: `A3LGT9100` → `K7GT9100`, `DKD529` → `DKD529MPU-IPC`.
- `look1` rescues `2AJGM-UVSR` → `2AJGMUV-5R` (S/5), `E5XKBM1O51O` → `E5XKBM10510` (O/0) and
  `A3LGT9100` → `A3LGTI9100` (dropped I), with no wrong picks. A tie between the two best
  suggestions means no pick.
- We briefly chose the stricter `ocr` rule (only look-alikes, thin-stroke drops and `RN↔M`-style
  merges). It turned down correct fccid.io redirects whose differences weren't on its list, which
  cost Tesseract 14 right answers on clean labels, so we switched to `look1`.
- The same rule gates 303 redirects. Of 91 redirects seen, only 32 were look-alike fixes; others
  were bad (`XOX148454` → `YGP148454`, `LABO` → `2ABDLABO`).

When a correction is followed, the results page says "Label read as …" and offers "Not this
device?" with fccid.io's other suggestions.

### 5. The viewfinder box

Should the scan screen show a box and read only what's inside? On the 498 simulated frames,
`look1+bare`, right / wrong:

| Variant | Paddle clean | Paddle degraded | Tesseract clean | Tesseract degraded | Paddle avg ms |
|---|---|---|---|---|---|
| Full frame | 484 / 2 | 487 / 2 | 467 / 1 | 306 / 1 | 1033 |
| Box 2:1 | 484 / 2 | 486 / 1 | 474 / 1 | 309 / 2 | 283 |
| Box 3:1 | 479 / 2 | 487 / 1 | 476 / 1 | 312 / 3 | 217 |
| Box 4:1 | 479 / 1 | 487 / 1 | 476 / 1 | 314 / 3 | 191 |

- Accuracy is a wash once the user has aimed this close. The win is speed: **Paddle runs about 5×
  faster on the box than on the whole frame.** The box also gets people to fill it with the label,
  which the simulation can't measure.
- Box shape barely matters. We shipped 3:1 first (it fits a two-line "FCC ID" / ID label) and later
  moved to 4:1, which scored the same and is a little faster.
- Centre-cropping the real photos (taken without a box) dropped Paddle from 54 to 42, because people
  don't centre the ID. So the app only crops live captures, never a chosen photo, and falls back to
  the full frame when the crop finds nothing.

### 6. Paddle reads big, sharp text worse

A surprise from the viewfinder runs: Paddle did better on degraded frames than clean ones. On large,
crisp crops it turns a final `1` into `-` (`2ASQI-3621-`) or drops an `I`. Shrinking the crop first
fixes most of it:

| Crop width (px) | 1046 (raw) | 800 | 640 | **480** | 400 | 320 |
|---|---|---|---|---|---|---|
| read right | 441 | 456 | 460 | **465** | 465 | 461 |
| resolved right / wrong | 479 / 2 | 486 / 1 | 488 / 2 | **490 / 1** | 488 / 1 | 487 / 1 |

Live captures are cropped to the box and resized to 480 px wide before OCR (`src/viewfinder.ts`).

### 7. Shrinking chosen photos (phone memory)

Paddle's text detector uses memory in proportion to the pixel count. A 12 MP iPhone photo peaked at
about 3.6 GB, far past what iOS Safari allows a tab, which then got killed. On 41 real label photos,
capping the long side at 1280 px read FCC IDs as well as full size (34 vs 33), peaked at about
0.8 GB and was about 35% faster (`src/image.ts`).

### 8. Upside-down labels

Paddle only reads upright text. Three of the real-photo misses were labels rotated 90° or 180°;
rotating and retrying recovered all three in testing. The app retries once at 180° when the upright
read finds no "FCC ID" line, and keeps both texts for the bare-ID fallback (`src/readLabel.ts`).

## Final numbers (1000 devices, 2000 images)

Right / wrong:

| Engine, policy | clean, checked (512) | degraded, checked (512) | clean, image only (488) | degraded, image only (488) | Total (2000) |
|---|---|---|---|---|---|
| Paddle, OCR read right | 480 (94%) | 423 (83%) | 385 (79%) | 228 (47%) | 1516 |
| Paddle, exact | 482 / 1 | 435 / 1 | 389 / 6 | 234 / 9 | 1540 / 17 |
| Paddle, look1 | 481 / 1 | 436 / 1 | 389 / 6 | 235 / 7 | 1541 / 15 |
| **Paddle, look1 + bare** | **495 / 1** | **451 / 1** | **400 / 8** | **243 / 8** | **1589 / 18** |
| Tesseract, OCR read right | 405 (79%) | 216 (42%) | 226 (46%) | 62 (13%) | 909 |
| Tesseract, look1 + bare | 463 / 1 | 273 / 4 | 268 / 6 | 86 / 0 | 1090 / 11 |

`look1 + bare` is the best rule for both engines and is what the app uses (`src/resolve.ts`).

### What's still wrong

The 18 wrong answers:

| Cause | n | Example |
|---|---|---|
| The label really prints another real ID (a sibling model's label reused in the filing, or a module's) | 9 | `LF57435`'s label says `LF57434` |
| A "Contains FCC ID" module listed before the host's own ID | 4 | `2BLPP-KDV1` → `XMR201903EG25G` |
| Bare fallback picked a sibling printed nearby | 3 | `C3K2021` label: "change of ID from C3K1985" |
| A heading word misread, then redirected | 1 | `FCCIDLael` → `KLAEL` (since fixed) |
| A 300 suggestion was a shorter sibling | 1 | `2AHPN-HSA-15U` → `2AHPN-HSA-15` |

Half of these are test-set noise: the label in the filing doesn't match the filing. The app shows
the other IDs it found under "Also on this label", which covers most of the rest.

The remaining misses are mostly damaged or image-only pages where the print is too small to read.

## Decisions along the way

| Decision | Why |
|---|---|
| Everything on the phone, no backend | Photos never leave the device, and there's no server to run or pay for. fccid.io sends `Access-Control-Allow-Origin: *`, so the browser can fetch it directly. The FCC's own site has no CORS and blocks bots. |
| fccid.io as the data source | Same filings as the FCC, readable from a browser, and its 300/303/404 answers turned out to be useful for fixing misreads. |
| PaddleOCR over Tesseract | Twice the accuracy. Worth the 25 MB first download, which the app now preloads in the background (skipped when Save-Data is on). |
| Self-host the models and WASM | No third-party CDN at scan time. |
| Count wrong answers separately, keep them near zero | A wrong device page looks just like a right one. "Not found" with suggestions is the safer failure. |
| Never trust fccid.io's first suggestion blindly | It gave 3 wrong answers on 65 photos; `look1` gave none. |
| Bare IDs only on an exact match | Otherwise any code-shaped word on a label becomes a guess. |
| Look up right after the scan, no confirm screen | With the gated corrections the first answer is usually right. The confirm step was an extra tap every time. |
| Crop live captures only | The box helps when the user aimed with it; cropping photos taken without it lost 12 of 65. |
| Don't tune on the real photos | With 65 images, tuning overfits. The 2000-image set is for tuning; the photos are the sanity check. |
| Keep the test images out of git | Third-party copyright. The scripts rebuild them. |

## Reference

### fccid.io behaviour

Probed with curl on 2026-10-22, `https://fccid.io/<id>`:

| Status | Meaning | Notes |
|---|---|---|
| **200** | Device page | Case- and hyphen-insensitive, no redirect. fccid.io's spelling can differ from the label (`2AJGM-UV5R` → `2AJGMUV-5R`), so read the canonical ID from the `<title>`. A bare company code (`2AJGM`) also returns 200, with that company's ID list. |
| **300** | "Possible Matches" | `<table class="table">` of similar IDs. The list changes over time. A different 300, "Search Matches", comes back for short input like `188` and isn't a "Did you mean". |
| **303** | Redirect to a corrected ID | `fetch` follows it silently. Gate it with the same rule as suggestions. |
| **404** | Not found | Shows a "Grantee Code Found" panel when the company code exists. Panel present: probably a real device missing from fccid.io, or a misread product code. No panel: the company code was misread. |
| **403** | Cloudflare challenge | For requests with a bare user agent. Node's `fetch` gets 403 even with browser headers, so the bench scripts use curl. A phone browser passes. |

All of 200/300/404 send `Access-Control-Allow-Origin: *`, so the browser can read every body.
Saved pages for each case are in `tests/fixtures/`.

### FCC ID format rules

- **Company (grantee) code** (format set by the FCC's OET): 3 characters if it starts with a
  letter, 5 if it starts with a digit (always `2` in our data). **It never contains the digits 0 or
  1**, though the letters O and I do appear (`O8F`, `I88`). So a `0` or `1` read there is really an
  `O` or `I`, with no lookup needed. All 65 real-photo IDs follow this.
- **Product code** (47 CFR 2.926(d)): capital letters, digits and `-`, at most 14 characters. No
  position rules, so look-alike fixes there still need fccid.io.
- Total length at most 19.

## Reproducing

- `collect/`: build the test sets. `fcc_exhibits.py` (label exhibits), `viewfinder.py` (viewfinder
  frames), `search*.mjs` / `cat.mjs` / `fetch.mjs` / `place*.mjs` (real photos from Commons and
  Openverse). Run Python with `python -I`.
- `bench/`: OCR every image and save the text (`all.mts`, `b2.mts`, `exhibits.mts`,
  `viewfinder.mts`, `viewfinder-size.mts`, `rot.mts`), then score it (`suggest.mts`, `score.mts`,
  `matrix.mts`). `fccId2.ts` is a looser matcher we tried and dropped (it found nothing extra with
  Paddle and added junk).
- The scripts were run from a scratch folder, so some absolute paths inside need updating. Deps:
  `sharp`, `@gutenye/ocr-node@1.4.9` and `tesseract.js`. Run with
  `node --experimental-strip-types`.
- Output (`*-texts.json`, `*-results.json`) is gitignored because it contains label text from the
  filings.

## Ideas not done yet

- Rank "Contains FCC ID" module IDs after the host's own ID (4 of the 18 wrong answers).
- Join an ID split across several OCR tokens (`DKD529 MPU-401`).
- A crop/zoom tool for small or busy labels.
- Retry at 90°/270° as well as 180°.
- `npm run bench:ocr` to rerun the benchmark from the repo.
