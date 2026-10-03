import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.jpg`, type: 'jpeg', quality: 80 });

async function newGameWithTutorial(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rouages-cie-reglages', JSON.stringify({ tutorial: true }));
  });
  await page.reload();
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  // le télex d'accueil d'abord, puis Marcel prend la main
  for (let i = 0; i < 6 && (await page.locator('#telex.show').count()); i++) await page.keyboard.press('Escape');
}

test.describe('tutoriel : le rail de Marcel', () => {
  test('prologue guidé pas à pas, panneau grisé, dette gelée', async ({ page }) => {
    await newGameWithTutorial(page);
    const guide = page.locator('#guide');
    await expect(guide).toBeVisible();
    await expect(page.locator('#guideTxt')).toContainText('gros bouton rouge');
    // l'échéance ne court pas pendant le rail
    const left0 = await page.evaluate(() => { const s = (window as any).__rouages.G.s; return s.due - s.t; });
    // accélérer le temps valide la première étape
    await page.keyboard.down('Space');
    await page.waitForTimeout(1200);
    await page.keyboard.up('Space');
    await expect(page.locator('#guideTxt')).toContainText('Le bouton ne fabrique rien');
    await page.locator('#guideOk').click();
    // embaucher : l'onglet Équipe est désigné, le reste du panneau est grisé
    await expect(page.locator('#tabs button[data-t="equipe"]')).toHaveClass(/guide-target/);
    await page.keyboard.press('2');
    await expect(page.locator('#list [data-act="hire"]')).toHaveClass(/guide-target/);
    await expect(page.locator('body')).toHaveClass(/railing/);
    await shot(page, 'tutoriel');
    await page.locator('#list [data-act="hire"]').click();
    await expect(page.locator('#guideTxt')).toContainText('il n’en bougera plus');
    const left1 = await page.evaluate(() => { const s = (window as any).__rouages.G.s; return s.due - s.t; });
    expect(Math.abs(left1 - left0)).toBeLessThan(1);
    // « Je connais, Marcel » arrête le rail, qui ne revient pas
    await page.locator('#guideSkip').click();
    await expect(guide).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/railing/);
    expect(await page.evaluate(() => (window as any).__rouages.G.s.story.flags['rail-0'])).toBe(1);
  });

  test('l’option du menu coupe le tutoriel', async ({ page }) => {
    await newGameWithTutorial(page);
    await expect(page.locator('#guide')).toBeVisible();
    await page.getByRole('button', { name: /Menu/ }).click();
    await page.locator('#ovTut').click();
    await expect(page.locator('#ovTutC')).toHaveText('Tutoriel : désactivé');
    await page.keyboard.press('Escape');
    await expect(page.locator('#guide')).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rouages-cie-reglages')!).tutorial)).toBe(false);
  });
});
