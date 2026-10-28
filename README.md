# FCC Peek

Photograph a device's FCC label, read the FCC ID on-device, and view the
device's FCC internal photos (fetched directly from fccid.io).

Everything runs in the browser: OCR (PaddleOCR PP-OCRv4 on ONNX Runtime Web,
self-hosted models and WASM, about 25 MB on first scan) and PDF rendering
(pdf.js). No backend.

## Develop

    npm install
    npm run dev      # http://localhost:5173 (camera works on localhost)
    npm test

On a phone over plain-HTTP LAN the live camera is unavailable (needs HTTPS);
"Choose photo" still works.

## Deploy (Cloudflare Pages)

    npx wrangler login
    npm run build
    npx wrangler pages deploy dist --project-name fcc-peek
