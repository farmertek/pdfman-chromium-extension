// Service worker: opens the PDF Manager page when the extension icon is clicked.

const AUTOLOAD_URL_PARAM = 'autoloadPdfUrl';
const AUTOLOAD_TAB_URL_PARAM = 'autoloadSourceTabUrl';
const AUTOLOAD_TAB_ID_PARAM = 'autoloadSourceTabId';
const RESOLVE_TAB_PDF_URL_MESSAGE = 'pdfman.resolvePdfUrlFromTab';

function hasPdfSuffix(url) {
  if (!url) return false;
  try {
    const clean = url.split('#')[0].split('?')[0];
    if (/\.pdf$/i.test(clean)) return true;
    return /\.pdf$/i.test(decodeURIComponent(clean));
  } catch {
    return false;
  }
}

function decodeRepeated(value, maxPasses) {
  let current = String(value || '');
  const passes = Number.isInteger(maxPasses) ? maxPasses : 2;

  for (let i = 0; i < passes; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function normalizeLocalPdfUrlCandidate(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;

  const decoded = decodeRepeated(rawValue.trim(), 2);
  if (!decoded) return null;

  const uncMatch = decoded.match(/^\\\\+([^\\\/]+)[\\\/]+(.+)$/);
  if (uncMatch) {
    const host = uncMatch[1];
    const pathPart = uncMatch[2]
      .split(/[\\\/]+/)
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const uncUrl = `file://${host}/${pathPart}`;
    return hasPdfSuffix(uncUrl) ? uncUrl : null;
  }

  if (!/^file:\/\//i.test(decoded)) return null;

  let candidate = decoded.replace(/\\/g, '/');
  const weirdUncMatch = candidate.match(/^file:\/{4,}([^/]+)\/(.+)$/i);
  if (weirdUncMatch) {
    candidate = `file://${weirdUncMatch[1]}/${weirdUncMatch[2]}`;
  }

  return hasPdfSuffix(candidate) ? candidate : null;
}

function extractLocalPdfUrl(tabUrl) {
  if (!tabUrl || typeof tabUrl !== 'string') return null;

  const direct = normalizeLocalPdfUrlCandidate(tabUrl);
  if (direct) return direct;

  // Chromium built-in PDF viewer may wrap source URL in query params (e.g. ?src=file:///...).
  try {
    const parsed = new URL(tabUrl);
    const candidateKeys = ['src', 'file', 'url'];
    for (const key of candidateKeys) {
      const value = parsed.searchParams.get(key);
      const normalized = normalizeLocalPdfUrlCandidate(value);
      if (normalized) return normalized;
    }

    if (parsed.hash && parsed.hash.length > 1) {
      const hashParams = new URLSearchParams(parsed.hash.slice(1));
      for (const key of candidateKeys) {
        const value = hashParams.get(key);
        const normalized = normalizeLocalPdfUrlCandidate(value);
        if (normalized) return normalized;
      }
    }
  } catch {
    // Ignore malformed URL values.
  }

  // Some PDF viewers embed local file URLs in opaque wrapper strings.
  const embedded = decodeRepeated(tabUrl, 2).match(/file:(?:\/\/\/|\/\/)[^\s"'<>]+/i);
  if (embedded) {
    return normalizeLocalPdfUrlCandidate(embedded[0]);
  }

  return null;
}

function resolvePdfUrlFromTabId(tabId, callback) {
  if (!chrome.tabs || typeof chrome.tabs.get !== 'function') {
    callback({ ok: false, error: 'tabs-api-unavailable' });
    return;
  }

  chrome.tabs.get(tabId, (tab) => {
    const runtimeError = chrome.runtime && chrome.runtime.lastError
      ? chrome.runtime.lastError
      : null;

    if (runtimeError) {
      callback({ ok: false, error: runtimeError.message || 'tabs-get-failed' });
      return;
    }

    const tabUrl = tab && typeof tab.url === 'string' ? tab.url : '';
    const pdfUrl = extractLocalPdfUrl(tabUrl);

    if (!pdfUrl) {
      callback({ ok: false, error: 'pdf-url-not-found', tabUrl });
      return;
    }

    callback({ ok: true, pdfUrl, tabUrl });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== RESOLVE_TAB_PDF_URL_MESSAGE) {
    return undefined;
  }

  const tabId = Number(message.tabId);
  if (!Number.isInteger(tabId) || tabId < 0) {
    sendResponse({ ok: false, error: 'invalid-tab-id' });
    return false;
  }

  resolvePdfUrlFromTabId(tabId, (result) => {
    sendResponse(result);
  });

  return true;
});

chrome.action.onClicked.addListener((tab) => {
  const managerUrl = new URL(chrome.runtime.getURL('manager.html'));
  const tabUrl = tab && typeof tab.url === 'string' ? tab.url : '';
  const localPdfUrl = extractLocalPdfUrl(tabUrl);
  if (localPdfUrl) {
    managerUrl.searchParams.set(AUTOLOAD_URL_PARAM, localPdfUrl);
  }
  if (tabUrl) {
    managerUrl.searchParams.set(AUTOLOAD_TAB_URL_PARAM, tabUrl);
  }
  if (tab && Number.isInteger(tab.id)) {
    managerUrl.searchParams.set(AUTOLOAD_TAB_ID_PARAM, String(tab.id));
  }
  chrome.tabs.create({ url: managerUrl.toString() });
});
