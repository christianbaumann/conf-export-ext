importScripts('utils.js', 'vendor/jszip.min.js');

const PAGE_LIMIT = 50;
const FETCH_CONCURRENCY = 5;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'export') return;
  port.onMessage.addListener(({ action, tabId, tabUrl }) => {
    if (action === 'start') runExport(port, tabId, tabUrl);
  });
});

async function detectConfluenceContext(tabId, tabUrl) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => ({
      contextPath: globalThis.AJS?.contextPath?.() ?? '',
      spaceKey: globalThis.AJS?.Meta?.get?.('space-key') ?? null,
    }),
  });
  const { contextPath, spaceKey } = results[0].result;
  if (!spaceKey) throw new Error('Not a Confluence space page.');
  const { origin } = new URL(tabUrl);
  return { baseUrl: origin + contextPath, spaceKey };
}

async function fetchSpaceName(baseUrl, spaceKey) {
  const url = `${baseUrl}/rest/api/space/${spaceKey}`;
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) throw new Error('Session expired. Reload Confluence and retry.');
  const data = await res.json();
  return data.name;
}

async function fetchAllPages(baseUrl, spaceKey, onProgress) {
  const pages = [];
  let start = 0;
  while (true) {
    const url = `${baseUrl}/rest/api/content?spaceKey=${spaceKey}&type=page` +
      `&expand=ancestors&limit=${PAGE_LIMIT}&start=${start}`;
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 401) throw new Error('Session expired. Reload Confluence and retry.');
    const data = await res.json();
    pages.push(...data.results);
    onProgress(pages.length);
    if (!data._links?.next) break;
    start += data.results.length;
  }
  return pages;
}

async function fetchPageContent(baseUrl, pageId) {
  const url = `${baseUrl}/rest/api/content/${pageId}?expand=body.view`;
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) throw new Error('Session expired. Reload Confluence and retry.');
  const data = await res.json();
  return data.body?.view?.value ?? '';
}

async function htmlToMarkdown(html) {
  const response = await chrome.runtime.sendMessage({
    action: 'convert-html',
    html,
  });
  return response.markdown;
}

const ATTACHMENT_SRC_RE = /\/download\/(attachments|thumbnails)\/\d+\/([^?"]+)/;

async function downloadAttachments(html, baseUrl, zipFolderPath, zip) {
  const urlsToDownload = new Map();

  const srcRe = /(src|href)="([^"]*\/download\/(attachments|thumbnails)\/[^"]+)"/gi;
  let m;
  while ((m = srcRe.exec(html)) !== null) {
    const attr = m[1];
    const fullUrl = m[2];
    const match = fullUrl.match(ATTACHMENT_SRC_RE);
    if (!match) continue;
    const filename = decodeURIComponent(match[2]);
    const subdir = attr.toLowerCase() === 'src' ? 'images' : 'attachments';
    const localPath = zipFolderPath ? `${zipFolderPath}/${subdir}/${filename}` : `${subdir}/${filename}`;
    urlsToDownload.set(fullUrl, { localPath, subdir, filename });
  }

  for (const [originalUrl, { localPath }] of urlsToDownload) {
    const absoluteUrl = originalUrl.startsWith('http')
      ? originalUrl
      : baseUrl + originalUrl.split('?')[0];
    const res = await fetch(absoluteUrl, { credentials: 'include' });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      zip.file(localPath, buffer, { binary: true });
    }
  }

  let rewritten = html;
  for (const [originalUrl, { subdir, filename }] of urlsToDownload) {
    const relPath = `./${subdir}/${filename}`;
    rewritten = rewritten.split(originalUrl).join(relPath);
  }

  return rewritten;
}

async function exportAllPages(pages, pageIndex, baseUrl, zip, port) {
  const total = pages.length;
  let done = 0;

  for (let i = 0; i < pages.length; i += FETCH_CONCURRENCY) {
    const batch = pages.slice(i, i + FETCH_CONCURRENCY);
    await Promise.all(batch.map(async (page) => {
      let html = await fetchPageContent(baseUrl, page.id);
      const { zipPath } = pageIndex.get(page.id);
      const zipFolder = zipPath.split('/').slice(0, -1).join('/');

      html = rewriteInternalLinks(html, zipPath, pageIndex);
      html = await downloadAttachments(html, baseUrl, zipFolder, zip);

      const markdown = await htmlToMarkdown(html);
      zip.file(zipPath, markdown);
      done++;
      port.postMessage({ type: 'progress', current: done, total, message: page.title });
    }));
  }
}

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'HTML-to-Markdown conversion and zip download',
    });
  }
}

async function triggerDownload(zip, spaceName) {
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const dataUrl = `data:application/zip;base64,${base64}`;
  const safeName = spaceName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '-');
  await chrome.downloads.download({ url: dataUrl, filename: `${safeName}.zip` });
}

async function runExport(port, tabId, tabUrl) {
  try {
  port.postMessage({ type: 'progress', message: 'Detecting space…' });

  const { baseUrl, spaceKey } = await detectConfluenceContext(tabId, tabUrl);
  const spaceName = await fetchSpaceName(baseUrl, spaceKey);
  port.postMessage({ type: 'progress', message: 'Fetching page list…' });

  const pages = await fetchAllPages(baseUrl, spaceKey, (count) => {
    port.postMessage({ type: 'progress', message: `Found ${count} pages…` });
  });

  const pageIndex = buildPageIndex(pages);
  const zip = new JSZip();

  await ensureOffscreenDocument();

  port.postMessage({ type: 'progress', message: 'Exporting pages…', current: 0, total: pages.length });
  await exportAllPages(pages, pageIndex, baseUrl, zip, port);

  port.postMessage({ type: 'progress', message: 'Building zip…' });
  await triggerDownload(zip, spaceName);

  port.postMessage({ type: 'done', message: `Done! ${pages.length} pages` });
  } catch (err) {
    port.postMessage({ type: 'error', message: err.message });
  }
}
