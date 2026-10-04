/* global process */
import { test, expect } from '@playwright/test';

const user2Email = process.env.E2E_USER2_EMAIL || 'user2@mail.com';
const user2Password = process.env.E2E_USER2_PASSWORD || '';

async function signIn(page, email, password) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/app', { timeout: 15_000 });
}

async function createModule(page, { name, code }) {
  await page.goto('/app/modules/new');
  await page.waitForSelector('#designer-name', { timeout: 10_000 });
  await page.fill('#designer-name', name);
  await page.fill('#designer-code', code);
  await page.fill('#designer-category', 'E2E');
  await page.click('button:has-text("Add Text")');
  const labels = page.getByLabel('Label');
  await labels.nth(0).fill('Title');
  await page.click('button:has-text("Publish Module")');
  await page.waitForSelector(`text=${name}`, { timeout: 20_000 });
  return page.url().split('/').pop();
}

async function submitRecord(page, moduleId, title) {
  await page.goto(`/app/modules/${moduleId}/form`);
  await page.waitForSelector('#field-title', { timeout: 10_000 });
  await page.fill('#field-title', title);
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Record Created', { timeout: 20_000 });
}

test.describe('Step 17.1.1 — configurable Ledger Books over universal evidence', () => {
  test('hidden auto evidence → configure book → backfill → continued registers → void stays consumed → reset clean', async ({ page }) => {
    test.setTimeout(360_000);
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    await signIn(page, user2Email, user2Password);

    const stamp = Date.now();
    const moduleName = `E2E 1711 Source ${stamp}`;
    const moduleCode = `E1711${stamp}`.slice(0, 20).toUpperCase();
    const moduleId = await createModule(page, { name: moduleName, code: moduleCode });

    // ─── 1. Three official form submissions — AUTO evidence book is created silently ───
    await submitRecord(page, moduleId, `Inspection A ${stamp}`);
    await submitRecord(page, moduleId, `Inspection B ${stamp}`);
    await submitRecord(page, moduleId, `Inspection C ${stamp}`);

    // ─── 2. Configure an intentional Ledger Book over that source (backfills history) ───
    const bookName = `Vehicle Register ${stamp}`;
    await page.goto('/app/ledger/new');
    await page.fill('#lb-name', bookName);
    await page.selectOption('#lb-source', moduleId);
    await page.fill('#lb-description', 'Official vehicle inspections');
    await expect(page.locator('#lb-prefix')).toHaveValue(moduleCode, { timeout: 5000 });
    await expect(page.locator('#lb-blocksize')).toHaveValue('100');
    await page.click('button:has-text("Create Ledger Book")');
    await page.waitForURL(/\/app\/ledger\/[a-zA-Z0-9_]+/, { timeout: 60_000 });
    await page.waitForSelector(`h1:has-text("${bookName}")`, { timeout: 30_000 });

    // Backfilled historical entries carry the NEW book's own immutable sequence
    await page.waitForSelector('table tr td', { timeout: 30_000 });
    const backfilled = await page.locator('table').textContent();
    expect(backfilled).toContain(`${moduleCode}-2026-000001`);
    expect(backfilled).toContain(`${moduleCode}-2026-000003`);

    // ─── 3. A FOURTH submission routes into the CONFIGURED book (not the auto fallback) ─
    await submitRecord(page, moduleId, `Inspection D ${stamp}`);
    await page.goto('/app/ledger');
    const configuredRow = page.locator('tr', { hasText: bookName });
    await expect(configuredRow).toBeVisible({ timeout: 15_000 });
    const rowText = await configuredRow.textContent();
    expect(rowText).toContain('4'); // used: 4 active entries
    expect(rowText).toContain('96'); // remaining

    await page.getByRole('link', { name: bookName }).first().click();
    await page.waitForSelector(`h1:has-text("${bookName}")`, { timeout: 15_000 });
    await page.waitForSelector('table tr td', { timeout: 15_000 });
    expect(await page.locator('table').textContent()).toContain(`${moduleCode}-2026-000004`);

    // ─── 4. Historical viewer: read-only + prev/next inside the configured book ───────
    await page.locator('tr', { hasText: `${moduleCode}-2026-000004` }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await expect(page.locator('[role="dialog"]')).toContainText('4 / 4');
    await expect(page.locator('[role="dialog"]')).toContainText('Read-only');
    expect(await page.locator('[role="dialog"] button:has-text("Submit")').count()).toBe(0);
    await page.locator('[role="dialog"] button:has-text("Previous")').click();
    await expect(page.locator('[role="dialog"]')).toContainText(`${moduleCode}-2026-000003`);
    await page.keyboard.press('Escape');

    // ─── 5. Cancel record from entry 2 → crossed out, sequence never reused ──────────
    await page.locator('tr', { hasText: `${moduleCode}-2026-000002` }).locator('a').first().click();
    await page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 });
    await page.click('button:has-text("Cancel record")');
    await page.locator('[role="dialog"] button:has-text("Cancel record")').click();
    await expect(page.getByText('Record cancelled', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 });

    await page.goto('/app/ledger');
    const voidedRow = page.locator('tr', { hasText: bookName });
    await expect(voidedRow).toBeVisible({ timeout: 15_000 });
    const voidedRowText = await voidedRow.textContent();
    expect(voidedRowText).toContain('1'); // voided == 1
    expect(voidedRowText).toContain('96'); // remaining stays 96 — void never frees the slot

    await page.getByRole('link', { name: bookName }).first().click();
    await page.waitForSelector(`h1:has-text("${bookName}")`, { timeout: 15_000 });
    const voidedEntry = page.locator('tr', { hasText: `${moduleCode}-2026-000002` });
    await expect(voidedEntry).toContainText('CANCELLED');
    // the voided form is still inspectable
    await voidedEntry.click();
    await expect(page.locator('[role="dialog"]')).toContainText('CANCELLED', { timeout: 10_000 });
    await page.keyboard.press('Escape');

    // ─── 6. Next submission consumes 000005 (the voided slot stays consumed forever) ──
    await submitRecord(page, moduleId, `Inspection E ${stamp}`);
    await page.goto('/app/ledger');
    await page.getByRole('link', { name: bookName }).first().click();
    await page.waitForSelector(`h1:has-text("${bookName}")`, { timeout: 15_000 });
    await page.waitForSelector('table tr td', { timeout: 15_000 });
    const afterFifth = await page.locator('table').textContent();
    expect(afterFifth).toContain(`${moduleCode}-2026-000005`);

    // ─── 7. Workspace Reset: no ghost books / entries / records ──────────────────────
    await page.goto('/app/settings');
    await expect(page.locator('text=Current Workspace:')).toBeVisible({ timeout: 15_000 });
    const confirmName = (await page.locator('text=Current Workspace:').textContent()).replace(/^Current Workspace:\s*/, '').trim();
    await page.click('button:has-text("Reset Workspace")');
    await page.fill('#reset-confirmation', confirmName);
    await page.getByRole('button', { name: /Permanently Reset Workspace/ }).click();
    await page.waitForURL(/\/app$/, { timeout: 60_000 });

    await page.goto('/app/ledger');
    await expect(page.locator('text=No Ledger Books have been configured yet')).toBeVisible({ timeout: 30_000 });

    // ─── 8. Clean rebuild: evidence works from sequence 000001 again ─────────────────
    const moduleId2 = await createModule(page, { name: `E2E 1711 After Reset ${stamp}`, code: `E1711B${stamp}`.slice(0, 20).toUpperCase() });
    await submitRecord(page, moduleId2, `After reset ${stamp}`);
    await page.goto('/app/ledger');
    const freshBook = `E2E 1711 After Reset ${stamp} Register`;
    await page.getByRole('link', { name: freshBook }).first().click();
    await page.waitForSelector(`h1:has-text("${freshBook}")`, { timeout: 15_000 });
    await page.waitForSelector('table tr td', { timeout: 15_000 });
    const freshText = await page.locator('table').textContent();
    expect(freshText).toContain('-2026-000001');
    expect(freshText).not.toContain(moduleCode);
  });
});
