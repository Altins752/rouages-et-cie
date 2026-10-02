import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.jpg`, type: 'jpeg', quality: 80 });

test('progression hors ligne : rapport d’absence au retour', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => {
    const r = (window as any).__rouages;
    r.start(3);
    for (let i = 0; i < 4; i++) r.A.hire(r.G.s, 0);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  // simule une absence de 2 heures (sans nouvelle sauvegarde au rechargement)
  await page.evaluate(() => {
    (window as any).__rouages.G.started = false;
    const raw = JSON.parse(localStorage.getItem('rouages-cie-pc')!);
    raw.savedAt -= 2 * 3600 * 1000;
    localStorage.setItem('rouages-cie-pc', JSON.stringify(raw));
  });
  await page.reload();
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByRole('heading', { name: 'Rapport d’absence' })).toBeVisible();
  await expect(page.locator('.sheet')).toContainText('2 h 00');
  await shot(page, 'absence');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Rapport d’absence' })).toBeHidden();
  expect(await page.evaluate(() => (window as any).__rouages.G.s.t)).toBeGreaterThan(7000);
});

test('fichier unique autonome : dist/rouages.html s’ouvre directement', async ({ page }) => {
  const url = pathToFileURL(resolve('dist/rouages.html')).href;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Rouages & Cie' })).toBeVisible();
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  await expect(page.locator('#telex')).toHaveClass(/show/);
  await page.keyboard.down('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('Space');
  expect(errors).toEqual([]);
  await shot(page, 'fichier-unique');
});
