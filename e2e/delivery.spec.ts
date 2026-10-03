import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.jpg`, type: 'jpeg', quality: 80 });

test('équipe de nuit : rapport d’absence et manque à gagner au retour', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => {
    const r = (window as any).__rouages;
    r.start(3);
    const s = r.G.s;
    s.act = 2;
    s.debt = 0;
    s.money = 1e6;
    for (let i = 0; i < 4; i++) r.A.hire(s, 0);
    for (let i = 0; i < 10; i++) r.A.upgradeNight(s, 'rate');
    r.A.upgradeNight(s, 'duration');
    s.money = 100;
  });
  await page.keyboard.press('2');
  await expect(page.locator('.sec', { hasText: 'Équipe de nuit' })).toBeVisible();
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
  await expect(page.locator('.sheet')).toContainText('L’équipe de nuit a tenu 45 min');
  await expect(page.locator('.sheet')).toContainText('Manque à gagner');
  await shot(page, 'absence');
  const t0 = await page.evaluate(() => (window as any).__rouages.G.s.t);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Rapport d’absence' })).toBeHidden();
  // 45 min à 5 % : environ 135 s de jeu ont été rattrapées
  expect(t0).toBeGreaterThan(130);
  expect(t0).toBeLessThan(400);
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
