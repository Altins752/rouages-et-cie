/**
 * Fixture commune : le tutoriel (rail de Marcel) est désactivé par défaut dans les tests,
 * sauf si un test enregistre lui-même des réglages avant de recharger la page.
 */
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('rouages-cie-reglages')) localStorage.setItem('rouages-cie-reglages', JSON.stringify({ tutorial: false }));
    });
    await use(page);
  },
});
export { expect } from '@playwright/test';
