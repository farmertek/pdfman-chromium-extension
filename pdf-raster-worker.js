/* ====================================================================
   PDF Manager Extension - Raster Worker
   Offloads heavy page rasterization for encrypted export/unlock paths.
   ==================================================================== */

'use strict';

self.importScripts('lib/pdf.js', 'lib/pdf-lib.min.js');

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.js';
}

function clampViewportByPixels(baseScale, getViewport, maxPixels) {
  let viewport = getViewport(baseScale);
  const pixels = viewport.width * viewport.height;
  if (pixels <= maxPixels) return viewport;

  const ratio = Math.sqrt(maxPixels / pixels);
  return getViewport(baseScale * ratio);
}

function getAdaptiveScale(pageCount, lowMemory, scaleHint) {
  if (typeof scaleHint === 'number' && scaleHint > 0) return scaleHint;

  if (lowMemory) {
    if (pageCount <= 20) return 1.6;
    if (pageCount <= 80) return 1.2;
    if (pageCount <= 160) return 1.0;
    if (pageCount <= 300) return 0.9;
    return 0.8;
  }

  if (pageCount <= 20) return 2.1;
  if (pageCount <= 80) return 1.6;
  if (pageCount <= 160) return 1.3;
  if (pageCount <= 300) return 1.1;
  return 1.0;
}

function normalizeRotation(rotations, origIdx) {
  if (!rotations) return 0;
  const value = Number(rotations[String(origIdx)] || 0);
  if (!Number.isFinite(value)) return 0;
  return value;
}

async function rasterizePageToJpeg(page, options) {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas is not supported in this browser context.');
  }

  const rotation = options.rotation || 0;
  const maxPixels = options.maxPixels;
  const quality = options.quality;
  const scale = options.scale;

  const getViewport = (s) => page.getViewport({ scale: s, rotation });
  const origViewport = getViewport(1.0);
  const viewport = clampViewportByPixels(scale, getViewport, maxPixels);

  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(viewport.width)),
    Math.max(1, Math.round(viewport.height))
  );

  try {
    const ctx = canvas.getContext('2d', { alpha: false });
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const jpgBytes = new Uint8Array(await blob.arrayBuffer());
    return {
      bytes: jpgBytes,
      width: origViewport.width,
      height: origViewport.height,
    };
  } finally {
    try { page.cleanup(); } catch { /* ignore */ }
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function rasterizePdfJob(options) {
  const loadOptions = {
    data: options.bytes,
    disableWorker: true,
  };
  if (options.password) loadOptions.password = options.password;

  let pdfDoc = null;
  try {
    const task = pdfjsLib.getDocument(loadOptions);
    pdfDoc = await task.promise;

    const pageOrder = Array.isArray(options.pageOrder) && options.pageOrder.length
      ? options.pageOrder
      : Array.from({ length: pdfDoc.numPages }, (_, i) => i);

    const scale = getAdaptiveScale(pageOrder.length, options.lowMemory, options.scaleHint);
    const outDoc = await PDFLib.PDFDocument.create();

    for (let i = 0; i < pageOrder.length; i++) {
      const origIdx = pageOrder[i];
      const page = await pdfDoc.getPage(origIdx + 1);
      const angle = normalizeRotation(options.rotations, origIdx);

      const rasterized = await rasterizePageToJpeg(page, {
        rotation: angle,
        scale,
        quality: options.quality,
        maxPixels: options.maxPixels,
      });

      const image = await outDoc.embedJpg(rasterized.bytes);
      const newPage = outDoc.addPage([rasterized.width, rasterized.height]);
      newPage.drawImage(image, {
        x: 0,
        y: 0,
        width: rasterized.width,
        height: rasterized.height,
      });

      if ((i + 1) % 6 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return new Uint8Array(await outDoc.save());
  } finally {
    if (pdfDoc) {
      try { pdfDoc.destroy(); } catch { /* ignore */ }
    }
  }
}

self.onmessage = async (event) => {
  const data = event && event.data ? event.data : {};
  const id = data.id;

  try {
    if (!data || !data.bytes) throw new Error('Missing PDF bytes for raster worker task.');

    const bytes = new Uint8Array(data.bytes);
    const output = await rasterizePdfJob({
      bytes,
      password: data.password || '',
      pageOrder: data.pageOrder || null,
      rotations: data.rotations || null,
      quality: typeof data.quality === 'number' ? data.quality : 0.9,
      maxPixels: typeof data.maxPixels === 'number' ? data.maxPixels : 5000000,
      scaleHint: typeof data.scaleHint === 'number' ? data.scaleHint : null,
      lowMemory: !!data.lowMemory,
    });

    self.postMessage({ id, ok: true, bytes: output.buffer }, [output.buffer]);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
};
