import { expect, test, type Locator, type Page } from '@playwright/test';

async function openLogin(page: Page) {
  await page.getByRole('button', { name: /Personnel/ }).click();
  await expect(page.getByLabel('Identifiant')).toBeVisible();
}
async function expectOptOut(field: Locator) {
  await expect(field).toHaveAttribute('autocomplete', 'off');
  for (const attribute of ['data-lpignore', 'data-1p-ignore', 'data-bwignore']) {
    await expect(field).toHaveAttribute(attribute, 'true');
  }
}

test('la connexion désactive l’autocomplétion sans casser le masquage ni la validation', async ({ page }) => {
  await page.goto('/');
  await openLogin(page);
  const identifier = page.getByLabel('Identifiant');
  const password = page.getByLabel('Mot de passe', { exact: true });
  await expectOptOut(page.locator('form'));
  await expectOptOut(identifier);
  await expectOptOut(password);
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('spellcheck', 'false');
  await identifier.selectOption('USR-ADMIN');
  await password.fill('mot-de-passe-incorrect');
  await password.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Mot de passe incorrect');
  // Ne pas réutiliser le secret saisi pour un autre compte.
  await identifier.selectOption('USR-BIL');
  await expect(password).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeDisabled();
});

test('la connexion au clavier fonctionne et le mot de passe n’est pas conservé à la déconnexion', async ({ page }) => {
  await page.goto('/');
  await openLogin(page);
  await page.getByLabel('Identifiant').selectOption('USR-ADMIN');
  await page.getByLabel('Mot de passe', { exact: true }).fill('admin123');
  await page.getByLabel('Mot de passe', { exact: true }).press('Enter');
  await page.getByRole('button', { name: /Déconnexion/ }).click();
  await openLogin(page);
  await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Identifiant')).toHaveValue('');
});

test('création, modification et réinitialisation administrateur gardent les indications anti-autocomplétion', async ({ page }) => {
  await page.goto('/');
  await openLogin(page);
  await page.getByLabel('Identifiant').selectOption('USR-ADMIN');
  await page.getByLabel('Mot de passe', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Nouveau Compte', exact: true }).click();
  await expectOptOut(page.getByPlaceholder('Mot de passe', { exact: true }));
  await expectOptOut(page.getByPlaceholder('Ex: DOC004, CAI002'));
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('button', { name: 'Personnel & Accès', exact: true }).click();
  await page.getByTitle('Modifier le compte', { exact: true }).first().click();
  await expectOptOut(page.getByPlaceholder('Mot de passe', { exact: true }));
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByTitle('Réinitialiser le mot de passe', { exact: true }).first().click();
  const password = page.getByLabel('Nouveau mot de passe :', { exact: true });
  await expectOptOut(password);
  await page.getByRole('button', { name: 'Masquer le mot de passe', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await expectOptOut(password);
  await page.getByRole('button', { name: 'Afficher le mot de passe', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expectOptOut(password);
});
