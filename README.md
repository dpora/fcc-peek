# FCC Peek

Point your phone at the label on a gadget and see photos of what's inside it, without opening it.

FCC Peek reads the FCC ID off a device's label with on-device OCR, looks it up on
[fccid.io](https://fccid.io), and shows the documents the maker filed with the FCC: internal photos
first, then external photos, manuals, block diagrams and the rest.

## Why I made this

I go thrifting a lot and like to scrap electronics for parts. A shelf of old routers, speakers,
keyboards and baby monitors is a lot more interesting when you know what's inside. Is there a
decent speaker driver, a lithium cell, a usable display, a Wi-Fi module, a big heatsink? Usually
the only way to find out is to buy it and open it up.

Almost anything with a radio already has those teardown photos online, filed with the FCC. FCC
Peek gets me to them in a few seconds, standing in the aisle: scan the label, see the board.

## What is an FCC ID?

Anything sold in the US that sends radio signals (phones, routers, wireless keyboards, earbuds,
smart-home gear, remotes) has to be approved by the Federal Communications Commission. The FCC ID
is that approval's code. It's printed on the device's label, usually as `FCC ID: BCG-E3175A`.

- The first 3 characters (or 5, when it starts with a digit) are the **grantee code**, which
  identifies the company. `BCG` is Apple.
- The rest is the **product code**, chosen by the company.

Each FCC ID points to a public filing. Depending on what the maker kept confidential, it can
include:

| Document | What it gives you |
|---|---|
| **Internal Photos** | The device opened up: boards, chips, batteries, speakers, displays. The main reason this app exists. |
| External Photos | Every side of the device. |
| User Manual | Often the only manual still online for old hardware. |
| ID Label/Location Info | Where the label is and what it says. |
| Block Diagram, Schematics, Parts List | How it's built. Usually confidential, sometimes not. |
| Test Report, RF Exposure Info | Radio power and frequencies, from the test lab. |

Plus who made it, what the product is and when it was approved. Some exhibits are held back for a
while after approval ("short-term confidentiality"); the app shows the date they become public.

## How it works

1. **Scan.** Line the "FCC ID" line up with the box on the camera screen and tap Capture, or
   choose a photo. The app crops to the box and reads the text with PaddleOCR. If it finds no
   "FCC ID" line, it reads the image again upside down.
2. **Find the ID.** A matcher (`src/fccId.ts`) picks FCC IDs out of the text and fixes the
   misreads it can be sure of. For example, grantee codes never contain `0` or `1`, so those must
   be `O` and `I`.
3. **Look it up.** Each ID is looked up on fccid.io. When fccid.io suggests a correction, the app
   follows it only if it's one OCR slip away from what was read (`src/resolve.ts`). Otherwise it
   shows a "Not found" page with an editable ID and "Did you mean" suggestions.
4. **Browse.** The results page shows the device and a grid of its document types. PDFs are
   rendered in the browser with pdf.js. An "Images" mode shows only the photos, pulled out of the
   PDF pages at full resolution, which is the quickest way through an Internal Photos exhibit.

Everything runs in the browser. Photos never leave the phone; the only network requests are to
fccid.io and for the app's own files. There's no backend. The OCR model (about 25 MB) is
self-hosted and downloads in the background when the app opens, so the first scan doesn't wait.
Recent lookups are kept in the browser's local storage.

## Accuracy

On a set of 2000 FCC label images, the app finds the right device for 79% and a wrong one for
0.9%. On clean labels it's 97%. On 65 real photos of labels: 54 right, 0 wrong (three of the 65
aren't on fccid.io at all).

How the test data was gathered, every approach we tried and what it did to the numbers, and the
decisions behind the current pipeline are in **[docs/ocr-research](docs/ocr-research/README.md)**.

## Code structure

Vite + vanilla TypeScript, no UI framework. Tests with Vitest.

```
src/
  main.ts          App entry: hash router, renders a screen per route
  route.ts         Pure hash-route parsing (#/, #/id/<FCC ID>, ...)
  ui/
    scan.ts        Camera, viewfinder, Capture / Choose photo, recent scans
    results.ts     Device page, "Not found" page, manual entry
    documents.ts   Document-type grid, "More documents" list, PDF viewer
    help.ts        "What is FCC Peek?" sheet
    idForm.ts      FCC ID input form
    errors.ts      User-facing error messages
  ocr.ts           PaddleOCR (PP-OCRv4 on ONNX Runtime Web), loaded lazily
  readLabel.ts     Read once, retry upside down if no "FCC ID" line was found
  image.ts         Shrink photos before OCR (phone memory limits)
  viewfinder.ts    Box size and the crop from video frame to box
  fccId.ts         Find FCC ID candidates in OCR text; format rules
  fccidio.ts       Fetch and parse fccid.io pages (device, suggestions, not found)
  resolve.ts       Turn candidates into a device, gating fccid.io's corrections
  pdfView.ts       Render exhibit PDFs (whole pages, or just the embedded photos)
  docTypes.ts      FCC exhibit types, their order and colors
  docNames.ts      Short labels for documents with long, similar titles
  recent.ts        Recent lookups in localStorage
  store.ts         In-memory hand-off from the scan to the results screen
  devCamera.ts     Dev-only fake camera (see below)
  dom.ts           Tiny element helper
tests/             Unit tests; fixtures/ has saved fccid.io pages for each response type
scripts/           copy-ocr-assets.mjs: copies OCR models and pdf.js decoders into public/
docs/ocr-research/ OCR research write-up, benchmark and data-collection scripts
```

The pure logic (matcher, resolver, parsers, routing) is kept apart from the DOM and the network,
so it's tested directly. Network calls are passed in as functions.

## Develop

    npm install
    npm run dev      # http://localhost:5173 (camera works on localhost)
    npm test

On a phone over plain-HTTP LAN the live camera is unavailable (it needs HTTPS); "Choose photo"
still works.

### Fake camera (dev server only)

To test the Scan screen on a desktop without a webcam, add `?fakecam` to the URL:

    http://localhost:5173/?fakecam                            # generated label, FCC ID BCG-E3175A
    http://localhost:5173/?fakecam=/@fs/C:/path/to/label.jpg  # any image file as the camera feed

The feed fills the viewfinder the way a real camera does, so line the label up with the box in the
image. Production builds leave this out entirely (`src/devCamera.ts`, imported only when
`import.meta.env.DEV`).

## Deploy (Cloudflare Pages)

    npx wrangler login
    npm run build
    npx wrangler pages deploy dist --project-name fcc-peek

## Credits

Device data and documents come from public FCC filings via [fccid.io](https://fccid.io). OCR by
[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) through
[@gutenye/ocr-browser](https://github.com/gutenye/ocr); PDF rendering by
[pdf.js](https://mozilla.github.io/pdf.js/).
