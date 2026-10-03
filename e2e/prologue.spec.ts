import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screens/${test.info().project.name}-${name}.jpg`, type: 'jpeg', quality: 80 });

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => (window as any).__rouages.start(5));
  await page.keyboard.press('Escape');
}

test('zone rouge : il faut mitrailler, et l’écran rougit', async ({ page }) => {
  await start(page);
  const box = (await page.locator('#btnGo').boundingBox())!;
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.5;
  // on mitraille par salves jusqu'à voir l'aiguille en zone rouge (le régime retombe vite)
  let fill = '';
  for (let k = 0; k < 4 && fill !== '#ff5a4a'; k++) {
    for (let i = 0; i < (k ? 8 : 26); i++) {
      await page.mouse.click(x, y, { delay: 5 });
      await page.waitForTimeout(40);
    }
    fill = (await page.locator('#gTxt').getAttribute('fill')) ?? '';
  }
  const rev = await page.evaluate(() => (window as any).__rouages.G.rev);
  expect(fill).toBe('#ff5a4a');
  expect(rev).toBeGreaterThan(0.75);
  await shot(page, 'zone-rouge');
});

test('info-bulle au survol d’un poste et d’un ouvrier', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const r = (window as any).__rouages;
    for (let i = 0; i < 4; i++) r.A.hire(r.G.s, 0);
    r.skip(30);
  });
  const box = (await page.locator('#stage').boundingBox())!;
  // poste de frappe de la chaîne 1 : deuxième colonne, première rangée
  const pos = await page.evaluate(() => {
    const r = (window as any).__rouages;
    const cam = r.cam;
    const cv = document.getElementById('cv') as HTMLCanvasElement;
    const dpr = cv.width / cv.getBoundingClientRect().width;
    const sx = (178 - cam.x) * cam.zoom + cv.width / 2;
    const sy = (118 + 6 - cam.y) * cam.zoom + cv.height / 2;
    return { x: sx / dpr, y: sy / dpr };
  });
  await page.mouse.move(box.x + pos.x, box.y + pos.y);
  await expect(page.locator('#tip')).toHaveClass(/show/);
  await expect(page.locator('#tip')).toContainText('Frappe');
});

test('carte d’actions : clic sur une machine, raccourci clavier, Échap', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const r = (window as any).__rouages;
    for (let i = 0; i < 4; i++) r.A.hire(r.G.s, 0);
    r.G.s.money = 500;
  });
  const box = (await page.locator('#stage').boundingBox())!;
  const pos = await page.evaluate(() => {
    const r = (window as any).__rouages;
    const cam = r.cam;
    const cv = document.getElementById('cv') as HTMLCanvasElement;
    const dpr = cv.width / cv.getBoundingClientRect().width;
    return { x: ((178 - cam.x) * cam.zoom + cv.width / 2) / dpr, y: ((118 + 6 - cam.y) * cam.zoom + cv.height / 2) / dpr };
  });
  await page.mouse.click(box.x + pos.x, box.y + pos.y);
  const card = page.locator('#ecard');
  await expect(card).toHaveClass(/show/);
  await expect(card).toContainText('Frappe · chaîne 1');
  await expect(card.getByRole('button', { name: /Outiller/ })).toBeEnabled();
  await page.keyboard.press('2');
  expect(await page.evaluate(() => (window as any).__rouages.G.s.tooling[0][1])).toBe(1);
  // la carte reste ouverte et se met à jour ; le chiffre n'a pas changé d'onglet
  await expect(card).toContainText('niveau 1/50');
  await expect(page.locator('#tabs button[data-t="atelier"]')).toHaveAttribute('aria-selected', 'true');
  await shot(page, 'carte-actions');
  await page.keyboard.press('Escape');
  await expect(card).not.toHaveClass(/show/);
});

test('rembourser la dette ouvre l’acte I et le bureau d’études', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const r = (window as any).__rouages;
    for (let i = 0; i < 5; i++) r.A.hire(r.G.s, 0);
    r.skip(120);
    r.G.s.money = 900;
  });
  await page.keyboard.press('4');
  await page.locator('#list').getByRole('button', { name: /Rembourser/ }).click();
  expect(await page.evaluate(() => (window as any).__rouages.G.s.act)).toBe(1);
  await expect(page.locator('#telex')).toHaveClass(/show/);
  await expect(page.locator('#tTxt')).toContainText(/./);
  await page.keyboard.press('Escape');
  await page.keyboard.press('3');
  await expect(page.getByText('Machines : mécanique')).toBeVisible();
  await expect(page.locator('#objL')).toContainText('50');
  await page.keyboard.press('1');
  await shot(page, 'acte1-debut');
});
