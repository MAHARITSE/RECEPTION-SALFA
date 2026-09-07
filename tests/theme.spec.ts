import { expect, test, type Page } from '@playwright/test';

const background = { dark: 'rgb(5, 7, 10)', light: 'rgb(248, 250, 252)' };
const surface = { dark: 'rgb(8, 11, 16)', light: 'rgb(255, 255, 255)' };

async function expectTheme(page: Page, theme: 'dark' | 'light') {
  await expect(page.locator('html')).toHaveClass(theme);
  await expect(page.locator('body')).toHaveClass(theme);
  await expect(page.locator('body')).toHaveCSS('background-color', background[theme]);
  const toggle = page.locator('#theme-toggle-btn');
  await expect(toggle).toHaveAttribute('data-theme', theme);
  await expect(toggle).toHaveText('');
  await expect(toggle.locator('svg')).toHaveCount(1);
  await expect(toggle.locator(theme === 'dark' ? '.lucide-sun' : '.lucide-moon')).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content', theme === 'dark' ? '#05070a' : '#f8fafc',
  );
}

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('#theme-toggle-btn')).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
}

async function loginAsAdmin(page: Page) {
  await page.getByRole('button', { name: /Personnel/ }).click();
  await page.getByLabel('Identifiant').selectOption('USR-ADMIN');
  await page.getByLabel('Mot de passe', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('button', { name: /Déconnexion/ })).toBeVisible();
}

test('le thème sombre Email est appliqué par défaut, même sur un OS clair', async ({ page }) => {
  await openApp(page);
  await expectTheme(page, 'dark');
  await expect(page.locator('header').first()).toHaveCSS('background-color', surface.dark);
  await expect(page.locator('#theme-toggle-btn')).toHaveAccessibleName('Passer en mode clair');
});

test('une préférence existante est appliquée avant le démarrage de React', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('salfa_theme', 'light'));
  await page.route('**/src/main.tsx*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass('light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8fafc');
  await expect(page.locator('#root')).toBeEmpty();
});

test('la bascule au clavier est mémorisée et indépendante du thème système', async ({ page }) => {
  await openApp(page);
  const toggle = page.locator('#theme-toggle-btn');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expectTheme(page, 'light');
  await expect(toggle).toHaveAccessibleName('Passer en mode sombre');
  expect(await page.evaluate(() => localStorage.getItem('salfa_theme'))).toBe('light');

  const badge = page.locator('tbody tr').first().locator('td').nth(8).locator('span');
  const lightBadgeColor = await badge.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'light');
  await expect(badge).toHaveCSS('background-color', lightBadgeColor);
  await page.reload();
  await expectTheme(page, 'light');
  await toggle.click();
  await expectTheme(page, 'dark');
  await page.reload();
  await expectTheme(page, 'dark');
});

test('une préférence invalide ou un stockage bloqué ne fait pas planter le thème', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    try { localStorage.setItem('salfa_theme', 'invalide'); } catch { /* Stockage bloqué au second chargement. */ }
  });
  await openApp(page);
  await expectTheme(page, 'dark');

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Stockage bloqué', 'SecurityError'); },
    });
  });
  await page.reload();
  await expectTheme(page, 'dark');
  await page.locator('#theme-toggle-btn').click();
  await expectTheme(page, 'light');
  await page.locator('#theme-toggle-btn').click();
  await expectTheme(page, 'dark');
  expect(errors).toEqual([]);
});

test('les onglets synchronisent leur thème sans perdre la recherche', async ({ page, context }) => {
  await openApp(page);
  await page.getByRole('textbox', { name: 'Rechercher un patient' }).fill('RAK');
  const other = await context.newPage();
  await openApp(other);
  await other.locator('#theme-toggle-btn').click();
  await expectTheme(other, 'light');
  await expectTheme(page, 'light');
  await expect(page.getByRole('textbox', { name: 'Rechercher un patient' })).toHaveValue('RAK');

  await page.locator('#theme-toggle-btn').click();
  await expectTheme(page, 'dark');
  await expectTheme(other, 'dark');
});

test('les champs et fenêtres changent de thème sans effacer la saisie', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Nouveau', exact: true }).click();
  const dossier = page.getByPlaceholder('SAISIE MANUELLE — MAJUSCULES');
  await dossier.fill('TST9001');
  await expect(dossier).toHaveCSS('background-color', surface.dark);
  await page.locator('#theme-toggle-btn').click();
  await expectTheme(page, 'light');
  await expect(dossier).toHaveValue('TST9001');
  await expect(dossier).toHaveCSS('background-color', surface.light);
  await page.locator('#theme-toggle-btn').click();
  await expectTheme(page, 'dark');
  await expect(dossier).toHaveValue('TST9001');
  await expect(dossier).toHaveCSS('background-color', surface.dark);
});

test('les survols et la sélection des lignes restent visibles dans les deux thèmes', async ({ page }) => {
  await openApp(page);
  const row = page.locator('tbody tr').first();
  for (const theme of ['dark', 'light'] as const) {
    await expectTheme(page, theme);
    await row.hover();
    await expect(row).toHaveCSS('background-color', theme === 'dark' ? 'rgb(20, 28, 40)' : 'rgb(241, 245, 249)');
    await row.click();
    await page.locator('h1').hover();
    await expect(row).toHaveClass(/bg-accent-soft/);
    await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toBeEnabled();
    if (theme === 'dark') {
      await page.locator('#theme-toggle-btn').click();
      // Une autre ligne non sélectionnée permet de vérifier le survol clair.
      await page.locator('tbody tr').nth(1).click();
    }
  }
});

test('connexion, administration et tous les rôles utilisent la palette commune', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  await loginAsAdmin(page);
  for (const role of ['doctor', 'cashier', 'pharmacy', 'magasinier', 'laboratory', 'billing', 'admin']) {
    await page.locator('header select').selectOption(role);
    for (const theme of ['dark', 'light'] as const) {
      await expectTheme(page, theme);
      await expect(page.locator('header').first()).toHaveCSS('background-color', surface[theme]);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText('Une erreur est survenue', { exact: false })).toHaveCount(0);
      await page.locator('#theme-toggle-btn').click();
    }
  }
  expect(errors).toEqual([]);
});

test('la messagerie suit le thème choisi', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Messagerie interne' }).click();
  const panel = page.locator('div[style="height: 70vh;"]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('background-color', surface.dark);
  await page.locator('#theme-toggle-btn').click();
  await expectTheme(page, 'light');
  await expect(panel).toHaveCSS('background-color', surface.light);
});

test('les tickets restent blancs et le bouton de thème ne se fait pas imprimer', async ({ page }) => {
  await openApp(page);
  await loginAsAdmin(page);
  await page.getByRole('button', { name: 'Tickets POS & Format', exact: true }).click();
  await page.getByRole('button', { name: 'Prévisualiser le Ticket POS', exact: true }).click();
  await expect(page.locator('.theme-paper')).toHaveCSS('background-color', surface.light);
  await expect(page.locator('.theme-paper')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('#theme-toggle-floating-container')).toBeHidden();
  await expect(page.locator('.theme-paper')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await page.emulateMedia({ media: 'screen' });
  await expectTheme(page, 'dark');
});

for (const width of [320, 390, 768]) {
  test(`le sélecteur et la connexion restent accessibles à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openApp(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('#theme-toggle-btn').click();
    await expectTheme(page, 'light');
    await page.getByRole('button', { name: /Personnel/ }).click();
    await expect(page.getByLabel('Identifiant')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('#theme-toggle-btn').click();
    await expectTheme(page, 'dark');
  });
}
