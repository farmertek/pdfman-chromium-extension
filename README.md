# PDFMan Browser Extension

PDFMan Browser Extension is a Chromium-based browser extension for PDF management workflows.

## Scope

This repository is for the browser extension code only.
It is intentionally separate from any Python-based "PDF Manager" project.

## Main files

- `manifest.json`
- `background.js`
- `manager.html`
- `manager.js`
- `pdf-raster-worker.js`

## Build

```bash
npm install
npm run build
```

## Load in Chromium browser

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this folder.
