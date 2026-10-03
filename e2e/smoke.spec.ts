import { expect, test } from './fixtures';
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
    await page.locator('#list').getByRole('button', { name: /Embaucher/ }).click();
    expect(await page.evaluate(() => (window as any).__rouages.G.s.workers.length)).toBe(2);
    await page.keyboard.press('4');
    await expect(page.locator('#tabs button[data-t="marche"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#list').getByText('Dette de la forge')).toBeVisible();
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

  test('carnet de Marcel : quête accomplie, aide pas à pas', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const carnet = page.locator('#quests');
    await expect(carnet).toBeVisible();
    await expect(carnet).toContainText('Embaucher un ouvrier');
    await expect(carnet).toContainText('Rembourser la dette');
    // l'aide ouvre la bulle, désigne l'onglet puis le bouton, et se valide en le faisant
    await page.locator('[data-q="p-hire"]').click();
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('#guideTxt')).toContainText('Équipe');
    await expect(page.locator('#tabs button[data-t="equipe"]')).toHaveClass(/guide-target/);
    await page.keyboard.press('2');
    await expect(page.locator('[data-act="hire"]')).toHaveClass(/guide-target/);
    await shot(page, 'guide');
    await page.locator('[data-act="hire"]').click();
    await expect(page.locator('#guide')).toBeHidden();
    await expect(carnet).not.toContainText('Embaucher un ouvrier');
    await expect(carnet).toContainText('Ouvrir un poste sur la chaîne 2');
  });

  test('carte postale : l’usine seule, capture en PNG', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('p');
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('#console')).toBeHidden();
    await expect(page.locator('#postcard')).toBeVisible();
    await shot(page, 'carte-postale');
    const dl = page.waitForEvent('download');
    await page.locator('#pcShot').click();
    expect((await dl).suggestedFilename()).toMatch(/^rouages-cie-.*.png$/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeVisible();
  });

  test('succès : débloqués, listés dans le menu', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const r = (window as any).__rouages;
      r.G.s.money = 1e15;
      for (let k = 0; k < 50; k++) r.A.upgradeTool(r.G.s, 0, 3);
    });
    await expect(page.locator('.toast', { hasText: 'Taylor serait fier' })).toBeVisible();
    await page.getByRole('button', { name: /Menu/ }).click();
    await page.locator('#ovAch').click();
    await expect(page.locator('.ach li.on', { hasText: 'Taylor serait fier' })).toBeVisible();
    await shot(page, 'succes');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as any).__rouages.G.paused)).toBe(false);
  });

  test('carnet du grand-père : une page trouvée se lit dans le menu', async ({ page }) => {
    await newGame(page);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      (window as any).__rouages.G.s.stats.sold = 1;
    });
    await expect(page.locator('.toast', { hasText: 'La forge, 1952' })).toBeVisible();
    await page.getByRole('button', { name: /Menu/ }).click();
    await page.locator('#ovNote').click();
    await expect(page.locator('.notebook .page:not(.locked)')).toHaveCount(1);
    await expect(page.locator('.notebook')).toContainText('trois marteaux');
    await expect(page.locator('.notebook .page.locked').first()).toContainText('Page 2');
    await shot(page, 'carnet');
  });

  test('radio de l’atelier : joue sans erreur, se coupe au pupitre', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await newGame(page);
    await page.keyboard.press('Escape');
    // un geste du joueur démarre le son ; la radio suit le site
    await page.mouse.click(300, 400);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { (window as any).__rouages.G.s.act = 3; });
    await page.waitForTimeout(1500);
    await expect(page.locator('#btnRadio')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#btnRadio').click();
    await expect(page.locator('#btnRadio')).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
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
