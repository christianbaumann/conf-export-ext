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
  test('shows error and re-enables button on non-Confluence page', async ({ context, extensionId }) => {
    const tabPage = await context.newPage();
    await tabPage.route('http://test.local/', route =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Not Confluence</h1>' }),
    );
    await tabPage.goto('http://test.local/');

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await tabPage.bringToFront();

    await popup.evaluate(() => document.getElementById('action-btn').click());

    await expect(popup.locator('#status')).toHaveText('Not a Confluence space page.', { timeout: 2000 });
    await expect(popup.locator('#action-btn')).toBeEnabled({ timeout: 500 });
    await expect(popup.locator('#progress-bar-wrap')).toBeHidden({ timeout: 500 });
  });
});
