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
});
