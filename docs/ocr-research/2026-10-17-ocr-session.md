# OCR research session — 2026-10-17

Goal: find out how well FCC Peek reads FCC IDs from label photos, and what to change.

## Test images (`tests/example_images/`)

| Folder | Count | Source |
|---|---|---|
| `user_marked/` | 13 | Hand-picked and labeled by the project owner. Hardest set (clutter, glare, low resolution). |
| `wikimedia_commons/` | 27 | Wikimedia Commons "FCC ID" search. `manifest.json` has source, author, license. |
| `web_batch2/` | 25 | Commons categories (Wi-Fi cards, keyboards, modules…) + 1 Flickr (CC BY). `manifest.json` likewise. |

- File name = FCC ID (normalized). Every ID was read by eye from the full image and checked on fccid.io.
- Not on fccid.io: `PDD-AR5B93` (300, suggests `LZ-AR5B93`), `PP2RX03031` (404), `I88RLG607N` (404; likely a label-maker mockup).
- CC BY-SA images need attribution: keep `manifest.json` with them.

## Results (PaddleOCR vs Tesseract)

| Setup | user_marked (13) | commons (27) | batch2 (25) | Total (65) |
|---|---|---|---|---|
| Tesseract, app today (default settings) | 4 | 11 | 8 | 23 |
| Tesseract, tuned (gray, 1600px, PSM 11, Sauvola) | 9 | 11 | 5 | 25 |
| **PaddleOCR PP-OCRv4 (`@gutenye/ocr-node`)**, current matcher | 10 | 22 | 18 | **50** |

- Tesseract tuning was overfitted to `user_marked`; drop it.
- The "looser matcher" (`bench/fccId2.ts`) gains nothing with Paddle and adds junk candidates.
- Paddle timing: ~0.2–2.9 s/image native on desktop. **Phone-browser speed not measured yet.**
- Models: ~16 MB (det 4.7 MB, rec 10.8 MB, cls 0.6 MB) vs 3 MB for Tesseract `best_int`.

## Paddle misses and fixes

| ID | What Paddle read | Fix |
|---|---|---|
| `C3K1409`, `VHE-3`, `PD97260NGU` | nothing (label rotated 90/180°) | **Rotate-and-retry** when no candidate — tested, recovers all 3 |
| `BR98YV1764` | `FCCID.NO.BR98YV1764` | matcher: skip `NO.` |
| `ZNFE960` | `FCCID:ZNFE960IC:2703C…` | matcher: cut run-on `IC:` |
| `DKD529MPU-401`, `FSQ4VYFK-2000PLUS` | split by spaces | matcher: join >2 tokens, or fccid.io 300 suggestions |
| `2AYMH-NP-154` | `2AYMH-NP-154305445` (run-on) | fccid.io similar-ID fallback |
| `A3LGTI9100`, `E5XKBM10510`, `2AJGM-UV5R` | dropped/look-alike chars | fccid.io similar-ID / look-alike fallback |
| `I88RLG607N` | `188RLG607N` | grantee-code check flags it; device not on fccid.io anyway |
| `NOI9900-11215-000`, `PDD-AR5B93`, `ZKJ-WCATA006` | garbled / too small | probably unrecoverable |

## Detecting failure (fccid.io behaviour)

- **200** → exact device page.
- **300** → "No exact FCC ID was found, but these IDs look similar" + table of matches. E.g. `2AJGM-UVSR` → `2AJGMUV-5R` (correct, listed first), `2AJGM-UV6R`.
  The app currently treats this as an error (`getDevice` in `src/fccidio.ts`) — the best fallback is thrown away.
- **404** → ambiguous: misread *or* device not on fccid.io. Check the grantee code (`fccid.io/<grantee>`): a 200 grantee page means the read is probably right; a missing grantee means a misread (try look-alike swaps 1↔I, 0↔O, 5↔S, 8↔B).
- fccid.io canonical form can differ from the label (`2AJGM-UV5R` → `2AJGMUV-5R`); follow fccid.io's answer.
- OCR confidence is **not** a usable failure signal (wrong reads scored 0.93–0.98).

### Re-probe 2026-10-22 (curl, `https://fccid.io/<id>`)

| Status | Page `<title>` | Body | Example |
|---|---|---|---|
| **200** device | `FCC ID <canonical> - <desc>` | device page | `BR98YV1764`; case- and hyphen-insensitive (`br98yv1764`, `BR98-YV1764`, `2AJGM-UV5R` → `2AJGMUV-5R`), no redirect, so read the canonical ID from the title |
| **200** grantee | `<company> FCC ID Applications (<code>)` | grantee's ID list | `2AJGM`, `I88`. A bare grantee code returns 200 too, so a 200 doesn't always mean a device page |
| **300** similar | `FCC ID <id> Possible Matches` | `<table class="table">`, rows: FCC ID (link) / Match type / Applicant / Description / Date | `2AJGM-UVSR` → `2AJGMUV-5R`, `2AJGM-UV6R` ("Similar FCC ID"); `PDD-AR5B93` → `HLZ-`, `PDN-`, `PPD-AR5B93` ("Product-code suffix"). Suggestions change over time (on 10-17 it was `LZ-AR5B93`) |
| **300** search | `FCC ID Search Matches for <q>` | up to about 50 product-code matches | short or unknown input such as `188`. Separate from "Possible Matches": don't show it as "Did you mean" |
| **404** | `Search for <id>` | "No exact FCC ID page was found" + **"Grantee Code Found" panel when the grantee exists** (`<h3 class="panel-title">Grantee Code Found</h3>` … `<a href="/I88">`) | `PP2RX03031`, `I88RLG607N`, `2AYMH-NP-154305445` have the panel (probably a real device missing from fccid.io, or a run-on/misread suffix); `188RLG607N` has no panel, so the grantee is wrong and the read is likely bad |
| **403** | `Security check` | Cloudflare challenge ("Enable JavaScript and cookies") | Every request with the bare UA `Mozilla/5.0`. A full Chrome UA + `Accept` header passes. `HEAD` passes either way |

- All statuses (200/300/404) send `Access-Control-Allow-Origin: *`, so a browser `fetch` can read every body.
- The 404 grantee panel makes a separate `fccid.io/<grantee>` request unnecessary.
- `2AYMH-NP-154305445` (run-on) returns **404 with the grantee panel**, not 300, so a suffix-trim retry is needed.
- **Risk:** the app treats 403 as a generic `http` error. A phone browser has a real UA and should pass, but a challenge can't be solved through `fetch()`. Not yet tested from the deployed app.

- **303** (found 10-22): fccid.io corrects some look-alike misreads itself and redirects to the right ID
  (`ESXKBM10510` → `E5XKBM10510`, `FBX5ESDFK515AT` → `FBX5E9DFK515AT`, `TV7RBS51UI-2ND` → `TV7RB951UI-2ND`).
  A browser `fetch` follows this silently, so the app already gets these.
- Node's `fetch` gets **403 even with browser headers** (Cloudflare fingerprints the client); curl passes. Bench scripts must use curl.

### Using the 300 suggestions (`bench/suggest.mts`, 2026-10-22)

Saved OCR text → current matcher → fccid.io lookup (following redirects) → policy on a 300 "Possible Matches" page.
Distance = edit distance on hyphen-less IDs, where a look-alike swap (`0ODQ 1IL7 5S 8B 2Z 6G UV 4A`) costs 0.25 and any other edit costs 1.
A tie between the two best suggestions → no auto-pick.

| Policy | Paddle right / wrong | Tesseract (app today) right / wrong |
|---|---|---|
| exact page only (incl. 303) | 49 / 0 | 26 / 1 |
| take first suggestion | 51 / **3** | 26 / **3** |
| look-alike only (d ≤ 0.75) | 51 / 0 | 26 / 1 |
| look-alike + 1 real edit (d ≤ 1.25) | **52 / 0** | 27 / 1 |
| **OCR patterns only** (`ocrFixes` ≤ 3, unique best) | **52 / 0** | 26 / 1 |

`ocrFixes` allows only: look-alike swaps, a dropped or invented thin stroke (`I 1 L`), and merges/splits `RN↔M`, `VV↔W`, `CL↔D`; hyphens are ignored.
Any other difference rules a suggestion out. It recovers the same three Paddle cases as the d ≤ 1.25 rule, without allowing arbitrary edits.
It rejects Tesseract's `JOC-QCNFA765` → `J9C-QCNFA765` (O↔9 isn't a known pattern), which d ≤ 1.25 accepted.
**Chosen rule for the app.**

- Paddle rescues: `2AJGM-UVSR` → `2AJGMUV-5R` (d 0.25), `E5XKBM1O51O` → `E5XKBM10510` (d 0.5), `A3LGT9100` → `A3LGTI9100` (d 1, dropped I; needs the 1.25 threshold).
- "First suggestion" is unsafe: `A3LGT9100` → `K7GT9100`, `DKD529` → `DKD529MPU-IPC`, `FSQ4VY` → `FSQ4VYFK-100`.
- For prefix reads (`DKD529`, `FSQ4VY`) the right ID is in the list but far away; that's the matcher's job (multi-token join).
- Remaining Paddle misses on fccid.io: not on fccid.io (`PP2RX03031`, `I88RLG607N`), run-on suffix 404 (`2AYMH-NP-154305445`), garbage (`ZATA6`).
- The single Tesseract "wrong" is a different, real FCC ID read off the same label (`E2KWM3945ABG` → `PIW632500516610`), not a suggestion error.

## FCC ID format rules (2026-10-22)

- **47 CFR 2.926(d), product code:** capital letters, digits and `-`; at most 14 characters, dashes included.
- **47 CFR 2.926(c), grantee code:** format set by OET, not in the rule text. The FCC page (via search, page itself 403s) says:
  - 3 characters if it starts with a letter, 5 if it starts with a digit.
  - **Grantee codes never contain the digits 1 or 0.**
- Checked against all 65 test IDs: **0 violations**.
  - Every digit-first code is `2xxxx`, 5 characters.
  - No `0` or `1` in any grantee code.
  - Letters `O` and `I` *do* appear (`O8F`, `I88`, `NOI`).
- Consequences for the matcher:
  - A `0` read inside the grantee is an `O`, and a `1` is an `I` (or `L`), with no network call needed (`188RLG607N` → `I88RLG607N`).
  - A leading digit other than `2` is a misread.
  - Product codes have no position rules, so look-alike fixes there still need fccid.io.
  - Total length is ≤ 19 (5 + 14), matching `ID_RE`.

### Grantee fixes in the matcher (`fixGrantee` in `src/fccId.ts`, 2026-10-22)

- In the grantee code, `0` → `O` and `1` → `I`. A leading `0`/`1` becomes a letter, which makes the code 3 characters.
- Leading digits 3–9 are left alone (no single obvious letter).
- Rerun of `bench/suggest.mts`:
  - Paddle OCR reads correct: 50 → **51**/65 (`188RLG607N` → `I88RLG607N`).
  - Resolved on fccid.io: unchanged at **52 right, 0 wrong**, because `I88RLG607N` isn't on fccid.io.
  - Tesseract: unchanged (26 / 1).
  - No regressions.

## 500-device exhibit set (2026-10-22)

- **Built by:** `collect/fcc_exhibits.py`, into `tests/fcc_exhibits/` (gitignored: manufacturers' copyright; rerun the script to rebuild).
- **Sampling:**
  - Grantees found through fccid.io search pages for 25 random 3-digit numbers, then 2 random devices per grantee page (pages span 1998–2026).
  - The `/grantees` index is useless for this: it lists newly registered codes, mostly with no filings.
  - Result: 500 devices, 243 grantees.
- **Per device:** first "Label" exhibit PDF (`<exhibit-url>.pdf`, 302 → `/m/<hash>.pdf`).
  - If the text layer contains the ID (241 devices, "checked"): a 300-dpi crop around it.
  - Otherwise (259, "image only"): the whole first page at 150 dpi. Includes real label photos, but also drawings with illegibly small print.
- **Degraded copy:** seeded tilt, rotation, lighting, glare, blur, noise, 45–75% scale, JPEG 45–75.
- **Bench:**
  - `bench/exhibits.mts` OCRs all 1000 images → `exhibits-texts.json`.
  - `bench/suggest.mts <cache> exhibits-texts.json` scores them → `exhibits-results.json`.

### Matcher bug found by the set (fixed in `src/fccId.ts`)

- Words after "FCC ID" were taken as IDs: `LABEL` (142 times), `LABELANDLOCATION`, `NUMBER`, `ENTIFICATION` (from "FCC IDENTIFICATION"), `LOCATION`, `SIZE`…
- fccid.io **303-redirects** some of these to real, unrelated devices (`LABEL` → `EA46GJLABEL`, `SIZE` → `LOVSONICBOOKSIZE`), so they became confident wrong answers. About 20 per set came from this.
- Fixes:
  - Skip digit-free heading words (`LABEL`/OCR variants, `LOCATION`, `STATEMENT`, `NUMBER`, `SIZE`, `SERIAL`, `ONLY`, `WILL`).
  - Don't match `FCC IDENTIF…`.
  - Skip `Number`/`No.` between label and ID. This also fixes `FCCID.NO.BR98YV1764`.

### fccid.io 303 redirects are not just look-alike fixes

- Of 91 redirects seen, 32 were look-alike only. The rest include good fixes (S↔8, S↔9, T↔7, a dropped character) and bad ones (`XOX148454` → `YGP148454`, `QQEE21R` → `2AAPK-TE21R`, `LABO` → `2ABDLABO`).
- Rule: **accept a redirect only if `ocrFixes(read, target) ≤ 3`, else offer it as "Did you mean"**.
- For Paddle, this gate costs 1 right answer and removes 1 wrong one. `ocr+` (adds S↔8, S↔9, T↔7) helps Tesseract only.

### First results (Paddle, `ocr` rule, after the heading-word fix)

| Set | n | read right | resolved right | resolved wrong |
|---|---|---|---|---|
| clean, checked | 241 | 219 (91%) | 219 | 0 |
| degraded, checked | 241 | 189 (78%) | 194 | 1 |
| clean, image only | 259 | 201 (78%) | 202 | 2 |
| degraded, image only | 259 | 116 (45%) | 117 | 2 |
| real photos | 65 | 52 | **53** | 0 |

- Before the matcher fix, the same Paddle runs resolved 672/1000 right and **79 wrong**. After: 732 right, **5 wrong**.
- Speed: 281 ms Tesseract vs 689 ms Paddle on average (desktop).
- Remaining wrong answers are mostly **labels that carry another real FCC ID**: a built-in module (`2BLPP-KDV1` label shows `XMR201903EG25G`) or a sibling model. The app should show every ID found on a label, not just the first that resolves.

### Why "checked" was only 91%: the 22 clean misses, by eye

Most were the matcher, not the OCR. Paddle had read the ID correctly in 15 of the 22.

| Cause | n | Fix |
|---|---|---|
| Repeated punctuation: `FCC ID. : UJO-ZAMM-TM110`, `FCC 1D.: 062N737` | 6 | Label regex allows `[\s:;.#]*` |
| Next field glued on: `…MK2SUBIC:6132A…`, `2A6JBMI01/IC:…` | 3 | Cut the token at `IC:` or `/` |
| `FCC Certification ID :` | 1 | Optional `CERTIFICATION` in the label regex |
| No "FCC ID" before the ID: bare on the label (`PKRNVWEM120`, `IC ID: 2AZ9PCC1020`), in a heading or callout (`CFS8DL5819S / 573F-5819S`, `PKRNVWMIFI5792 Label Location`, `2A7GQ-WH-8233B`), reading order mixed up (`FCC ID: Anschlu ⏎ NO9TC695`), "FCC" read as "CID" | 7 | `findBareCandidates` fallback (below) |
| ID rotated 90° (`RQZHPC-2115B`) | 1 | Rotate-and-retry: at 90° Paddle reads it exactly |
| ID printed ~5 px tall (`2ASNT10MINDS-MS1`) | 1 | Zoom/crop: 3× gives `2ASNT10MIND5-MS1`, one look-alike fix away |
| Bad crop from the collection script: ID off the edge, cut in half, or blank image | 3 | None (test-set artifact; true ceiling is 238/241) |

**`findBareCandidates(text)`** (`src/fccId.ts`):
- Finds uppercase words with a valid grantee code taken as printed (letter + 2 of `A-Z2-9`, or `2` + letter + 3 of `A-Z2-9`), a digit, and at least 6 characters.
- Splits glued words (`…5792LabelLocation`, `…XE75IC:`). IC numbers (`2977A-…`, `20631-…`) fail the grantee rule.
- Fallback only: used when no labelled candidate resolves, and accepted only on an exact fccid.io 200, never a 300 suggestion or a 303 redirect. At most 5 lookups.
- Not wired into the app yet. The confirm screen should show these marked as "found without an FCC ID label".

### Results with all matcher fixes (2026-10-22)

Each cell is resolved right / resolved wrong. Total = the four exhibit sets (1000 images).

**Paddle**

| Policy | clean, checked (241) | degraded, checked (241) | clean, image only (259) | degraded, image only (259) | Total (1000) | real photos (65) |
|---|---|---|---|---|---|---|
| read right | 229 (95%) | 196 (81%) | 203 (78%) | 117 (45%) | 745 | 53 |
| exact | 229 / 0 | 201 / 0 | 205 / 2 | 119 / 3 | 754 / 5 | 51 / 0 |
| first | 229 / 0 | 201 / 0 | 205 / 4 | 121 / 4 | 756 / 8 | 53 / 3 |
| look | 229 / 0 | 201 / 0 | 203 / 2 | 118 / 2 | 751 / 4 | 53 / 0 |
| look1 | 229 / 0 | 201 / 0 | 205 / 2 | 120 / 2 | 755 / 4 | 54 / 0 |
| ocr | 229 / 0 | 201 / 0 | 204 / 2 | 118 / 2 | 752 / 4 | 54 / 0 |
| ocr+ | 229 / 0 | 201 / 0 | 204 / 2 | 118 / 2 | 752 / 4 | 54 / 0 |
| **look1+bare** | **236 / 0** | **207 / 0** | **211 / 2** | **123 / 2** | **777 / 4** | **54 / 0** |
| ocr+bare | 236 / 0 | 207 / 0 | 210 / 2 | 121 / 2 | 774 / 4 | 54 / 0 |

**Tesseract (app today)**

| Policy | clean, checked | degraded, checked | clean, image only | degraded, image only | Total (1000) | real photos |
|---|---|---|---|---|---|---|
| read right | 183 (76%) | 98 (41%) | 113 (44%) | 30 (12%) | 424 | 23 |
| exact | 206 / 0 | 121 / 0 | 131 / 2 | 35 / 1 | 493 / 3 | 26 / 1 |
| first | 209 / 0 | 125 / 4 | 142 / 7 | 36 / 4 | 512 / 15 | 26 / 3 |
| look1 | 209 / 0 | 120 / 0 | 137 / 2 | 38 / 0 | 504 / 2 | 27 / 1 |
| ocr | 195 / 0 | 112 / 0 | 126 / 1 | 35 / 0 | 468 / 1 | 24 / 1 |
| look1+bare | 219 / 0 | 131 / 0 | 139 / 2 | 41 / 0 | 530 / 2 | 28 / 2 |

- **Paddle on clean checked labels: 236/241 (98%), 0 wrong.** The 5 left are the 3 bad crops, the rotated ID and the tiny ID.
- **Recommended rule: `look1+bare`** (replaces the earlier `ocr` recommendation). It matches or beats every other policy in every column. `ocr` turns down correct fccid.io redirects whose differences aren't on the OCR-mistake list. That cost Tesseract 14 right answers on clean checked labels.
- `first` (take the top suggestion blindly) gives the most wrong answers for both engines.
- The bare fallback added 22 right answers for Paddle and no wrong ones. For Tesseract it added one wrong: a photo read as `A3LSGHD900`, a real sibling model of `A3LSGHD900I` with the last letter dropped.
- Damaged and image-only pages are now the weak spots. A crop/zoom option in the app (planned) is the most likely fix.

## Plan (agreed order)

1. Switch OCR to PaddleOCR (`@gutenye/ocr-browser`); measure on a real phone before removing Tesseract.
2. Rotate-and-retry (90/180/270) only when the first pass finds no candidate.
3. ~~Matcher fixes: multi-token join, skip `NO.`, cut run-on `IC:`; with tests.~~ Done 2026-10-22 (plus heading words, grantee fixes, repeated punctuation, `Certification ID`, `findBareCandidates`). Multi-token join still open.
4. Results-screen fallbacks: "Did you mean…?" from HTTP 300; grantee check + look-alike swaps on 404. Use the `look1` rule for suggestions and 303 redirects; bare IDs on exact 200 only.
5. Crop/zoom option on the scan screen (planned): for small or busy labels and image-only pages.
6. Show every ID found on a label (module + host), not just the first that resolves.
7. Add `npm run bench:ocr` to rerun this benchmark from the repo.

Projected: ~56–58 / 65 after steps 1–4.

## Files here

- `bench/` — benchmark scripts and **saved OCR text** for every image/engine
  (`all-texts.json` = user_marked + commons, `batch2-texts.json` = web_batch2).
  Matcher changes can be scored against these without rerunning OCR (see `score.mts`).
- `collect/` — scripts used to search/download Commons and Openverse candidates and write the manifests.
- Scripts were run from a temporary scratch folder; absolute paths inside them
  (scratchpad, `node_modules` for `sharp`, `@gutenye/ocr-node`) need updating before reuse.
  Deps used: `sharp`, `@gutenye/ocr-node@1.4.9`, the repo's `tesseract.js`. Run with
  `node --experimental-strip-types`.
