import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.jpg`, type: 'jpeg', quality: 80 });

async function newGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  await expect(page.locator('#telex')).toHaveClass(/show/);
}

test.describe('prologue sur PC', () => {
  test('écran titre, télex, aucun défilement de page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Rouages & Cie' })).toBeVisible();
    await shot(page, 'titre');
    await page.getByRole('button', { name: /Nouvelle partie/ }).click();
    await expect(page.locator('#telex')).toHaveClass(/show/);
    await expect(page.locator('#tFrom')).toContainText('Banque');
    const scroll = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight, document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll[0]).toBeLessThanOrEqual(scroll[1] + 1);
    expect(scroll[2]).toBeLessThanOrEqual(scroll[3] + 1);
    // Entrée fait défiler les messages, Échap ferme
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('#telex')).not.toHaveClass(/show/);
    await shot(page, 'prologue');
  });

  test('la barre d’espace accélère le temps, sans produire', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    const sold0 = await page.evaluate(() => (window as any).__rouages.G.s.stats.produced);
    await page.keyboard.down('Space');
    await page.waitForTimeout(1200);
    const speed = await page.evaluate(() => (window as any).__rouages.G.speed);
    expect(speed).toBeGreaterThan(1.8);
    await expect(page.locator('#gTxt')).not.toHaveText('×1,00');
    await page.keyboard.up('Space');
    const produced = await page.evaluate(() => (window as any).__rouages.G.s.stats.produced);
    expect(produced).toBeGreaterThanOrEqual(sold0);
  });

  test('clic maintenu sur l’atelier : zone verte', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    const box = await page.locator('#stage').boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * 0.7);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    const rev = await page.evaluate(() => (window as any).__rouages.G.rev);
    await page.mouse.up();
    expect(rev).toBeGreaterThan(0.45);
    expect(rev).toBeLessThan(0.8);
  });

  test('acheter un outillage et changer d’onglet au clavier', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    const before = await page.evaluate(() => (window as any).__rouages.G.s.money);
    await page.locator('[data-act="tool"][data-i="3"]').click();
    const after = await page.evaluate(() => (window as any).__rouages.G.s.money);
    expect(after).toBeLessThan(before);
    await page.keyboard.press('2');
    await expect(page.locator('#tabs button[data-t="equipe"]')).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: /Embaucher/ }).click();
    expect(await page.evaluate(() => (window as any).__rouages.G.s.workers.length)).toBe(2);
    await page.keyboard.press('4');
    await expect(page.locator('#tabs button[data-t="marche"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Dette de la forge')).toBeVisible();
    await page.keyboard.press('h');
    await expect(page.getByRole('heading', { name: 'Aide' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Aide' })).toBeHidden();
  });

  test('confort : délai d’achat, repérage dans la scène, usine suivante', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const r = (window as any).__rouages;
      for (let i = 0; i < 4; i++) r.A.hire(r.G.s, 0);
      r.G.s.money = 1;
    });
    // un achat trop cher annonce quand il sera possible
    const unit = page.locator('[data-act="unit"][data-i="1"]');
    await expect(unit.locator('.eta')).toContainText('dans');
    // le survol désigne l'emplacement dans la scène
    await unit.hover();
    expect(await page.evaluate(() => (window as any).__rouages.G.highlight)).toBe('u:0:1:1');
    await page.mouse.move(10, 10);
    // [ et ] : usine précédente, suivante
    await page.evaluate(() => {
      const r = (window as any).__rouages;
      r.G.s.act = 1;
      r.G.s.money = 1e6;
      r.A.buyFactory(r.G.s);
      r.G.factory = 0;
    });
    await page.keyboard.press(']');
    expect(await page.evaluate(() => (window as any).__rouages.G.factory)).toBe(1);
    await page.keyboard.press(']');
    expect(await page.evaluate(() => (window as any).__rouages.G.factory)).toBe(0);
    await shot(page, 'confort');
  });

  test('sauvegarde : la partie reprend après rechargement', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const r = (window as any).__rouages;
      r.A.hire(r.G.s, 0);
      r.A.hire(r.G.s, 0);
      r.skip(60);
    });
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.reload();
    await page.getByRole('button', { name: /Continuer/ }).click();
    expect(await page.evaluate(() => (window as any).__rouages.G.s.workers.length)).toBe(3);
  });

  test('écran minimal 1280 × 720 : tout tient sans défilement', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await newGame(page);
    await page.keyboard.press('Escape');
    const scroll = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight, document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll[0]).toBeLessThanOrEqual(scroll[1] + 1);
    expect(scroll[2]).toBeLessThanOrEqual(scroll[3] + 1);
    await expect(page.locator('#stage')).toBeVisible();
    await expect(page.locator('#panel')).toBeVisible();
    await shot(page, 'prologue-1280');
  });
});
