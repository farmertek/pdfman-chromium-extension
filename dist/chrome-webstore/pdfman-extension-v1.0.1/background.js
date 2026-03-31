// Service worker: opens the PDF Manager page when the extension icon is clicked.

function hasPdfSuffix(url) {
  if (!url) return false;
  try {
    const clean = url.split('#')[0].split('?')[0];
    return /\.pdf$/i.test(clean);
  } catch {
    return false;
  }
}

function extractLocalPdfUrl(tabUrl) {
  if (!tabUrl || typeof tabUrl !== 'string') return null;

  if (tabUrl.startsWith('file://') && hasPdfSuffix(tabUrl)) {
    return tabUrl;
  }

  // Chromium built-in PDF viewer may wrap source URL in query params (e.g. ?src=file:///...).
  try {
    const parsed = new URL(tabUrl);
    const candidateKeys = ['src', 'file', 'url'];
    for (const key of candidateKeys) {
      const value = parsed.searchParams.get(key);
      if (value && value.startsWith('file://') && hasPdfSuffix(value)) {
        return value;
      }
    }
  } catch {
    // Ignore malformed URL values.
  }

  return null;
}

chrome.action.onClicked.addListener((tab) => {
  const managerUrl = new URL(chrome.runtime.getURL('manager.html'));
  const localPdfUrl = extractLocalPdfUrl(tab && tab.url ? tab.url : '');
  if (localPdfUrl) {
    managerUrl.searchParams.set('autoloadPdfUrl', localPdfUrl);
  }
  chrome.tabs.create({ url: managerUrl.toString() });
});
