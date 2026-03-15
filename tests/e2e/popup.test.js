import { test, expect } from './fixtures.js';

test.describe('Popup — initial state', () => {
  test('renders title, status and Export button', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popup.locator('h1')).toHaveText('Conf Export Ext');
    await expect(popup.locator('#status')).toHaveText('Ready');
    await expect(popup.locator('#action-btn')).toHaveText('Export Space');
    await expect(popup.locator('#action-btn')).toBeEnabled();
    await expect(popup.locator('#progress-bar-wrap')).toBeHidden();
  });
});

test.describe('Popup — export flow', () => {
  test('disables button and shows progress after clicking Export', async ({ context, extensionId }) => {
    // Open a plain HTTP page as the "active" tab the extension will operate on.
    // We serve a minimal non-Confluence HTML page via Playwright route interception.
    const tabPage = await context.newPage();
    await tabPage.route('http://test.local/', route =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Not Confluence</h1>' }),
    );
    await tabPage.goto('http://test.local/');

    // Open the popup as a separate page; then switch focus back so the extension
    // sees `tabPage` as the active tab when it calls chrome.tabs.query.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await tabPage.bringToFront();

    // Trigger Export via a programmatic click (does not steal focus).
    await popup.evaluate(() => document.getElementById('action-btn').click());

    // Background sends 'Detecting space…' before attempting script injection.
    await expect(popup.locator('#status')).toHaveText('Detecting space…', { timeout: 5000 });
    // Button must be disabled while the export is running.
    await expect(popup.locator('#action-btn')).toBeDisabled();
  });
});
