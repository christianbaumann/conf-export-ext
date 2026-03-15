const turndown = (() => {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  td.use(turndownPluginGfm.gfm);
  return td;
})();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'ping') {
    sendResponse({ ready: true });
    return true;
  }
  if (msg.action === 'convert-html') {
    try {
      const markdown = turndown.turndown(msg.html);
      sendResponse({ markdown });
    } catch (err) {
      sendResponse({ markdown: '', error: err.message });
    }
    return true;
  }
});
