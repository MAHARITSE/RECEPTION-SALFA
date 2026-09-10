import { expect, test, type Page } from '@playwright/test';
import { headerTypography } from '../src/utils/invoiceHeader';

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Personnel/ }).click();
  await page.getByLabel('Identifiant').selectOption('USR-ADMIN');
  await page.getByLabel('Mot de passe', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}
async function stored(page: Page) {
  return page.evaluate(async () => (await import('/src/browserDb.ts')).loadStateFromBrowser());
}
async function mockPrint(page: Page) {
  await page.addInitScript(() => {
    if (window === window.parent) (window as any).__invoiceHeaderPrints = [];
    window.print = () => {
      (window.parent as any).__invoiceHeaderPrints.push(document.documentElement.outerHTML);
      window.dispatchEvent(new Event('beforeprint'));
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 10);
    };
  });
}

test('Administration : police, A−/A+, aperçu, enregistrement et rechargement', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /En-tête Facture/ }).click();
  const editor = page.getByRole('textbox', { name: 'Texte de l’en-tête des factures' });
  await editor.fill('CENTRE TEST — EN-TÊTE COMMUN');
  await page.getByLabel('Police de l’en-tête', { exact: true }).selectOption('Times New Roman');
  await page.getByLabel('Taille de police de l’en-tête', { exact: true }).fill('14');
  await page.getByRole('button', { name: 'Augmenter la taille de police de l’en-tête', exact: true }).click();
  await expect(page.getByLabel('Taille de police de l’en-tête', { exact: true })).toHaveValue('15');
  await page.getByRole('button', { name: 'Diminuer la taille de police de l’en-tête', exact: true }).click();
  await expect(editor).toHaveCSS('font-family', /Times New Roman/);
  await expect(editor).toHaveCSS('font-size', '18.6667px');
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  await expect(page.getByTestId('invoice-header-preview')).toContainText('CENTRE TEST');
  await expect(page.getByTestId('invoice-header-preview')).toHaveCSS('font-family', /Times New Roman/);
  await page.getByRole('button', { name: "Enregistrer l'en-tête de facture", exact: true }).click();
  await expect.poll(async () => (await stored(page))!.ticketSettings.invoiceHeaderFontSize).toBe(14);
  expect((await stored(page))!.ticketSettings.invoiceHeaderFontFamily).toBe('Times New Roman');
  await login(page);
  await page.getByRole('button', { name: /En-tête Facture/ }).click();
  await expect(editor).toContainText('CENTRE TEST');
  await expect(page.getByLabel('Police de l’en-tête', { exact: true })).toHaveValue('Times New Roman');
  await expect(page.getByLabel('Taille de police de l’en-tête', { exact: true })).toHaveValue('14');
  await page.getByLabel('Taille de police de l’en-tête', { exact: true }).fill('36');
  await expect(page.getByRole('button', { name: 'Augmenter la taille de police de l’en-tête', exact: true })).toBeDisabled();
  await page.getByLabel('Taille de police de l’en-tête', { exact: true }).fill('6');
  await expect(page.getByRole('button', { name: 'Diminuer la taille de police de l’en-tête', exact: true })).toBeDisabled();
});

test('Facturation : en-tête Administration réellement imprimé, société A4 et individuelle A5', async ({ page, context }, testInfo) => {
  await mockPrint(page); await login(page);
  await page.getByRole('button', { name: /En-tête Facture/ }).click();
  await page.getByRole('textbox', { name: 'Texte de l’en-tête des factures' }).fill('EN-TÊTE A4 ET A5');
  await page.getByLabel('Police de l’en-tête', { exact: true }).selectOption('Georgia');
  await page.getByLabel('Taille de police de l’en-tête', { exact: true }).fill('12');
  await page.getByRole('button', { name: "Enregistrer l'en-tête de facture", exact: true }).click();
  await expect.poll(async () => (await stored(page))!.ticketSettings.invoiceHeaderFontFamily).toBe('Georgia');
  await page.locator('header select').selectOption('billing');
  await page.locator('#nav-tab-prestations').click();
  await page.getByRole('button', { name: /^Imprimer la facture mensuelle/ }).first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__invoiceHeaderPrints.length)).toBe(1);
  const archive = (await stored(page))!.monthlyInvoices;
  await page.getByRole('tab', { name: /Vue Détaillée/ }).click();
  await page.getByRole('button', { name: /^Imprimer la facture / }).first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__invoiceHeaderPrints.length)).toBe(2);
  const htmls: string[] = await page.evaluate(() => (window as any).__invoiceHeaderPrints);
  const preview = await context.newPage();
  for (const [index, expectedMm] of [[0, [210, 297]], [1, [148, 210]]] as const) {
    await preview.setContent('<!doctype html>' + htmls[index]);
    await expect(preview.locator('.invoice-header')).toContainText('EN-TÊTE A4 ET A5');
    await expect(preview.locator('.invoice-header-content')).toHaveCSS('font-family', /Georgia/);
    await expect(preview.locator('.invoice-header-content')).toHaveCSS('font-size', '16px');
    await expect(preview.locator('body')).toHaveCSS('font-family', /Arial/);
    await expect(preview.locator('body')).toHaveCSS('font-size', '10px');
    await expect(preview.locator('tbody td').first()).toHaveCSS('font-size', '10px');
    const pdf = await preview.pdf({ path: testInfo.outputPath(index === 0 ? 'societe-a4.pdf' : 'individuelle-a5.pdf'), preferCSSPageSize: true, displayHeaderFooter: false });
    const box = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(box).not.toBeNull();
    expect(Math.abs(Number(box![1]) - expectedMm[0] * 72 / 25.4)).toBeLessThan(2);
    expect(Math.abs(Number(box![2]) - expectedMm[1] * 72 / 25.4)).toBeLessThan(2);
  }
  expect((await stored(page))!.monthlyInvoices).toEqual(archive);
});

test('en-tête enrichi nettoyé : textes et image conservés, scripts et styles globaux supprimés', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { sanitizeInvoiceHeader } = await import('/src/utils/invoiceHeader.ts');
    return sanitizeInvoiceHeader(`<div><b>Texte conservé</b><script>alert('x')</script><style>body{display:none}</style><img src="data:image/png;base64,AA==" onerror="alert('x')"><iframe src="https://invalid.example"></iframe><span style="position:fixed;background-image:url(https://invalid.example);font-weight:bold">Fin</span></div>`);
  });
  expect(result).toContain('<b>Texte conservé</b>');
  expect(result).toContain('data:image/png;base64,AA==');
  expect(result).not.toMatch(/<script|<style|<iframe|onerror|position:\s*fixed|url\(/);
});

test('valeurs de police historiques ou invalides restent sûres et bornées', () => {
  expect(headerTypography({})).toEqual({ font: 'Arial', size: 10 });
  expect(headerTypography({ invoiceHeaderFontFamily: "x';}body{display:none}", invoiceHeaderFontSize: Infinity })).toEqual({ font: 'Arial', size: 10 });
  expect(headerTypography({ invoiceHeaderFontFamily: 'Courier New', invoiceHeaderFontSize: 80 })).toEqual({ font: 'Courier New', size: 36 });
  expect(headerTypography({ invoiceHeaderFontSize: -20 }).size).toBe(6);
});


test('facture Caisse : le même en-tête personnalisé et sa typographie sont conservés', async ({ page, context }) => {
  await mockPrint(page); await login(page);
  await page.evaluate(async () => {
    const state = (await (await import('/src/browserDb.ts')).loadStateFromBrowser())!;
    const settings = { ...state.ticketSettings, customInvoiceHeader: true, invoiceHeaderHtml: '<div><strong>EN-TÊTE CAISSE</strong></div>', invoiceHeaderFontFamily: 'Courier New', invoiceHeaderFontSize: 13 };
    const invoice = state.invoices[0];
    (await import('/src/utils/printSalfaInvoice.ts')).printSalfaIndividualInvoice(settings, invoice, state.patients.find(p => p.id === invoice.patientId));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__invoiceHeaderPrints.length)).toBe(1);
  const html = await page.evaluate(() => (window as any).__invoiceHeaderPrints[0]);
  const preview = await context.newPage(); await preview.setContent('<!doctype html>' + html);
  await expect(preview.locator('.invoice-header')).toContainText('EN-TÊTE CAISSE');
  await expect(preview.locator('.invoice-header strong')).toHaveCSS('font-family', /Courier New/);
  await expect(preview.locator('.invoice-header strong')).toHaveCSS('font-size', '17.3333px');
  expect(html).toContain('size: A5 portrait');
});
