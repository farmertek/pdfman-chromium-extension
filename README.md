# PDFMan Browser Extension

PDFMan Browser Extension is a Chromium-based browser extension for PDF management workflows.

## Scope

This repository is for the browser extension code only.
It is intentionally separate from any Python-based "PDF Manager" project.

## Related repositories

- Browser extension repo (this project): https://github.com/farmertek/pdfman-chromium-extension
- Python repo: https://github.com/farmertek/pdf-manager

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

## Build with Rust WASM helpers

The extension can use Rust WASM helpers for lazy render window calculation and preview size computation.

```bash
npm run build:wasm
npm run build
```

Or run both steps in one command:

```bash
npm run build:all
```

## Load in Chromium browser

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this folder.

## Changelog

- See `CHANGELOG.md` for release history and update notes.
