import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.jpg`, type: 'jpeg', quality: 80 });

test.describe('acte IV, fin et bac à sable', () => {
  test.setTimeout(240_000);

  test('acte IV joué par l’IA : usine noire et objectif du rachat', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const r = await page.evaluate(() => (window as any).__rouages.playTo(4, 9000));
    expect(r.act).toBe(4);
    await page.waitForTimeout(500);
    await expect(page.locator('#objL')).toContainText('Rachat de Ferrum');
    await shot(page, 'acte4');
    await page.keyboard.press('4');
    await expect(page.getByText('Racheter Ferrum Industries')).toBeVisible();
  });

  test('racheter Ferrum : séquence finale, fin, puis bac à sable', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => {
      const r = (window as any).__rouages;
      r.start(4);
      const s = r.G.s;
      s.act = 4;
      s.debt = 0;
      s.research.tier = 4;
      s.research.materials = [true, true, true, true, true, true, true];
      s.money = 1e9;
      for (let si = 0; si < 4; si++) while (r.A.modernizeTarget(s, 0, si)) r.A.modernize(s, 0, si);
      r.A.setMaterial(s, 0, 6);
      s.money = 2.1e9;
      s.stats.retrained = 5;
      s.stats.laidOff = 1;
      s.story.seen.act4 = 1;
      s.story.seen.blackResearch = 1;
      s.story.seen.diamond = 1;
      r.skip(5);
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('4');
    const btn = page.getByRole('button', { name: /Racheter/ });
    await expect(btn).toBeEnabled();
    await btn.click();
    // les lumières s'éteignent, puis la vieille forge se rallume
    await page.waitForTimeout(2500);
    await shot(page, 'fin-noir');
    await page.waitForTimeout(4500);
    await shot(page, 'fin-forge');
    await expect(page.getByRole('heading', { name: 'Fin' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#telex')).toHaveClass(/show/);
    await shot(page, 'fin-ecran');
    const st = await page.evaluate(() => {
      const s = (window as any).__rouages.G.s;
      return { act: s.act, ended: s.ended, ending: s.ending };
    });
    expect(st).toEqual({ act: 5, ended: true, ending: 'warm' });
    await page.getByRole('button', { name: /Continuer en bac à sable/ }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('4');
    await expect(page.getByText('Nouveau site (prestige)')).toBeVisible();
    await expect(page.locator('#objL')).toContainText('Bac à sable');
    await shot(page, 'bac-a-sable');
  });
});
