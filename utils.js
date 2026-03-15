/* exported pageToFilename, pageToFolderName, buildPageIndex, computeRelativePath, rewriteInternalLinks */

const UNSAFE_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const FALLBACK_TITLE = 'Untitled';

function pageToFilename(title) {
  const safe = (title ?? '').trim() || FALLBACK_TITLE;
  return safe
    .replace(UNSAFE_CHARS, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200)
    + '.md';
}

function pageToFolderName(title) {
  return pageToFilename(title).replace(/\.md$/, '');
}

function buildPageIndex(pages) {
  const index = new Map();
  for (const page of pages) {
    const folderParts = page.ancestors.map(a => pageToFolderName(a.title));
    const filename = pageToFilename(page.title);
    const zipPath = [...folderParts, filename].join('/');
    index.set(page.id, { title: page.title, zipPath });
  }
  return index;
}

function computeRelativePath(fromZipPath, toZipPath) {
  const fromParts = fromZipPath.split('/').slice(0, -1);
  const toParts = toZipPath.split('/');
  let shared = 0;
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] === toParts[i]) shared = i + 1;
    else break;
  }
  const up = fromParts.length - shared;
  const rel = [...Array(up).fill('..'), ...toParts.slice(shared)].join('/');
  return rel || './' + toParts.at(-1);
}

const PAGE_HREF_RE = /\/pages\/(\d+)|[?&]pageId=(\d+)/;

function rewriteInternalLinks(html, sourceZipPath, pageIndex) {
  return html.replace(/<a\s+([^>]*href="([^"]*)"[^>]*)>/gi, (match, _attrs, href) => {
    const m = href.match(PAGE_HREF_RE);
    if (!m) return match;
    const pageId = m[1] ?? m[2];
    const target = pageIndex.get(pageId);
    if (!target) return match;
    const rel = computeRelativePath(sourceZipPath, target.zipPath);
    return match.replace(href, rel);
  });
}
