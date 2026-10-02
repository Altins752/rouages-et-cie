import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.png` });

async function playTo(page: Page, act: number, extra: number): Promise<{ act: number; chains: number }> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const r = await page.evaluate(([a, e]) => (window as any).__rouages.playTo(a, e), [act, extra]);
  await page.waitForTimeout(600);
  return r;
}

test.describe('actes joués par l’IA du simulateur', () => {
  test.setTimeout(180_000);

  test('acte I : machines, contremaître, deux chaînes', async ({ page }) => {
    const r = await playTo(page, 1, 1500);
    expect(r.act).toBe(1);
    expect(r.chains).toBe(2);
    await expect(page.locator('#objL')).toContainText('50');
    // le contremaître signale le goulot
    await expect(page.locator('.tag.red').first()).toHaveText('goulot');
    await shot(page, 'acte1');
    // double-clic sur le second hall : il devient la chaîne affichée
    await page.locator('#tabs button[data-t="atelier"]').click();
    await page.getByRole('button', { name: 'Chaîne 2' }).click();
    await expect(page.getByRole('button', { name: 'Chaîne 2' })).toHaveClass(/on/);
    await page.keyboard.press('2');
    await expect(page.getByText('Encadrement')).toBeVisible();
    await shot(page, 'acte1-equipe');
  });

  test('acte I : une panne se voit et se répare, même sans argent', async ({ page }) => {
    await playTo(page, 1, 1500);
    await page.evaluate(() => {
      const r = (window as any).__rouages;
      r.G.s.chains[0].stations[1].units[0].broken = true;
      r.G.s.money = -50;
    });
    await expect(page.locator('.lamp[data-lamp="panne"]')).toHaveClass(/on/);
    await page.keyboard.press('1');
    await page.getByRole('button', { name: 'Chaîne 1' }).click();
    const repair = page.getByRole('button', { name: /Réparer n°1/ });
    await expect(repair).toBeEnabled();
    await repair.click();
    const u = await page.evaluate(() => (window as any).__rouages.G.s.chains[0].stations[1].units[0]);
    expect(u.service).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).__rouages.G.s.money)).toBeLessThan(-50);
    await shot(page, 'acte1-panne');
  });

  test('acte II : site régional, énergie visible, contrats, moral', async ({ page }) => {
    const r = await playTo(page, 2, 1500);
    expect(r.act).toBe(2);
    expect(r.chains).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => {
      const g = (window as any).__rouages;
      g.G.s.money += 30000;
    });
    await page.keyboard.press('1');
    const wind0 = await page.evaluate(() => (window as any).__rouages.G.s.energy.wind);
    await page.locator('[data-act="energy"][data-i="wind"]').click();
    await page.locator('[data-act="energy"][data-i="battery"]').click();
    expect(await page.evaluate(() => (window as any).__rouages.G.s.energy.wind)).toBe(wind0 + 1);
    await expect(page.getByText('Énergie')).toBeVisible();
    // contrats : accepter une offre s'il y en a une
    await page.keyboard.press('4');
    const accept = page.getByRole('button', { name: /Accepter/ }).first();
    if (await accept.count()) {
      await accept.click();
      expect(await page.evaluate(() => (window as any).__rouages.G.s.spot.some((c: any) => c.accepted))).toBe(true);
    }
    await shot(page, 'acte2-marche');
    await page.keyboard.press('2');
    await shot(page, 'acte2-equipe');
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    await shot(page, 'acte2');
  });

  test('acte III : robots, encadrement complet, onglet Données', async ({ page }) => {
    const r = await playTo(page, 3, 3600);
    expect(r.act).toBe(3);
    const info = await page.evaluate(() => {
      const s = (window as any).__rouages.G.s;
      return { roles: Object.values(s.roles).filter(Boolean).length, robots: s.chains.some((c: any) => c.stations.some((st: any) => st.tier >= 3)) };
    });
    expect(info.roles).toBeGreaterThanOrEqual(4);
    await page.waitForTimeout(400);
    await shot(page, 'acte3');
    await page.keyboard.press('5');
    expect(await page.locator('canvas.chart').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('canvas.chart').first()).toBeVisible();
    // survol d'un graphique : lecture d'une valeur
    const c = page.locator('canvas.chart').first();
    const b = (await c.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height / 2);
    await page.waitForTimeout(300);
    await shot(page, 'acte3-donnees');
    // zoom à la molette sur l'usine
    const st = (await page.locator('#stage').boundingBox())!;
    await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
    const z0 = await page.evaluate(() => (window as any).__rouages.cam.tz);
    await page.mouse.wheel(0, -600);
    expect(await page.evaluate(() => (window as any).__rouages.cam.tz)).toBeGreaterThan(z0);
    await page.waitForTimeout(700);
    await shot(page, 'acte3-zoom');
  });

  test('robots et usine noire : rendu des paliers 3 et 4', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => {
      const r = (window as any).__rouages;
      r.start(9);
      const s = r.G.s;
      s.act = 4;
      s.debt = 0;
      s.research.tier = 4;
      s.research.materials = [true, true, true, true, true, true, true];
      s.money = 1e10;
      r.A.buyChain(s);
      for (let si = 0; si < 4; si++) {
        while (s.chains[0].stations[si].tier < 3) r.A.modernize(s, 0, si);
        while (s.chains[1].stations[si].tier < 4) r.A.modernize(s, 1, si);
        for (let k = 0; k < 3; k++) { r.A.addUnit(s, 0, si); r.A.addUnit(s, 1, si); }
      }
      r.A.setMaterial(s, 0, 5);
      r.A.setMaterial(s, 1, 6);
      r.A.hire(s, 0);
      s.workers[1].level = 4;
      r.skip(40);
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await shot(page, 'paliers-3-4');
  });
});
