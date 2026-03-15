import { test as base, chromium } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const extensionPath = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const test = base.extend({
  // Persistent Chrome context with the extension loaded
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },

  // Extension ID derived from the registered service worker URL
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = new URL(sw.url()).hostname;
    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
