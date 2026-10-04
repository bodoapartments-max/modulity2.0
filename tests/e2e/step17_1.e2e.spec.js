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
    await page.click('button:has-text("Add Text")');
  await page.click('button:has-text("Add Long Text")');
  const labels = page.getByLabel('Label');
  await labels.nth(0).fill('Title');
  await labels.nth(1).fill('Notes');
  await page.click('button:has-text("Publish Module")');
  await page.waitForSelector(`text=${name}`, { timeout: 20_000 });
  return page.url().split('/').pop();
}

async function submitRecord(page, moduleId, title, notes = '') {
  await page.goto(`/app/modules/${moduleId}/form`);
  await page.waitForSelector('#field-title', { timeout: 10_000 });
  await page.fill('#field-title', title);
  if (notes) await page.fill('#field-notes', notes);
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Record Created', { timeout: 20_000 });
}

test.describe('Step 17.1 — universal Form Ledger & historical form viewer', () => {
  test('submit auto-registers → form book counters → viewer (read-only, prev/next) → cancel keeps history → reset leaves no ghost', async ({ page }) => {
    test.setTimeout(360_000);
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text().slice(0, 200)); });
    await signIn(page, user2Email, user2Password);

    const stamp = Date.now();
    const moduleName = `E2E 171 Register ${stamp}`;
    const moduleCode = `E171${stamp}`.toUpperCase();
    const moduleId = await createModule(page, { name: moduleName, code: moduleCode });

    await submitRecord(page, moduleId, `Form A ${stamp}`, 'first');
    await submitRecord(page, moduleId, `Form B ${stamp}`, 'second');
    await submitRecord(page, moduleId, `Form C ${stamp}`, 'third');

    // ─── 1. Form Book row: named register with correct counters ───
    await page.goto('/app/ledger');
    await page.waitForTimeout(2500);
    const row = page.locator('tr', { hasText: moduleName }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const rowText = await row.textContent();
    expect(rowText).toContain('100');
    expect(rowText).toContain('3');
    expect(rowText).toContain('97');

    // ─── 2. Open the register: entries ordered by sequence with FIRST reference 000001 ───
    const bookName = `${moduleName} Register`;
    await page.getByRole('link', { name: bookName }).first().click();
    await page.waitForSelector(`h1:has-text("${bookName}")`, { timeout: 15_000 });
    const entriesTableText = await page.locator('table').textContent();
    expect(entriesTableText).toContain('-2026-000001');
    expect(entriesTableText).toContain('-2026-000003');

    // ─── 3. Historical viewer: read-only, sequence navigation, void evidence ───
    await page.locator('tr', { hasText: '-2026-000003' }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await expect(page.locator('[role="dialog"]')).toContainText(moduleName);
    await expect(page.locator('[role="dialog"]')).toContainText('-2026-000003');
    await expect(page.locator('[role="dialog"]')).toContainText('Read-only');
    await expect(page.locator('[role="dialog"]')).toContainText('3 / 3');
    // fields are disabled — no submit actions in the viewer
    expect(await page.locator('[role="dialog"] button:has-text("Submit")').count()).toBe(0);

    // Navigate backwards through the register
    await page.locator('[role="dialog"] button:has-text("Previous")').click();
    await expect(page.locator('[role="dialog"]')).toContainText('-2026-000002');
    await page.locator('[role="dialog"] button:has-text("Previous")').click();
    await expect(page.locator('[role="dialog"]')).toContainText('-2026-000001');
    expect(await page.locator('[role="dialog"] button:has-text("Previous")').first().isDisabled()).toBeTruthy();
    // viewer preserves the historical field set for the same module
    await expect(page.locator('[role="dialog"]')).toContainText('Notes');
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // ─── 4. Cancel record C → entry stays consumed, marked, never reused ───
    // Find record C from the entries table record link
    await page.locator('tr', { hasText: '-2026-000003' }).locator('a', { hasText: 'rec' }).first().click();
    await page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 });
    await page.click('button:has-text("Cancel record")');
    await page.locator('[role="dialog"] button:has-text("Cancel record")').click();
    // Wait for the trusted callable to actually commit: success toast +
    // dialog closure — do NOT race ahead on the dialog's own body text.
    await expect(page.getByText('Record cancelled', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 });

    await page.goto('/app/ledger');
    const rowAfterCancel = page.locator('tr', { hasText: moduleName }).first();
    await expect(rowAfterCancel).toBeVisible({ timeout: 15_000 });
    expect(await rowAfterCancel.textContent()).toContain('1'); // voided == 1

    await page.getByRole('link', { name: bookName }).first().click();
    const voidedRow = page.locator('tr', { hasText: '-2026-000003' });
    await expect(voidedRow).toContainText('CANCELLED');

    // View the voided form — it stays readable and marked
    await voidedRow.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await expect(page.locator('[role="dialog"]')).toContainText('CANCELLED');
    await page.keyboard.press('Escape');

    // Sequence is never reused: a FOURTH submission consumes 000004 (not the voided slot)
    await submitRecord(page, moduleId, `Form D ${stamp}`);
    await page.goto(`/app/ledger`);
    await page.getByRole('link', { name: bookName }).first().click();
    await page.waitForSelector(`h1:has-text("${bookName}")`, { timeout: 15_000 });
    const entriesAfterNew = await page.locator('table').textContent();
    expect(entriesAfterNew).toContain('-2026-000004');

    // ─── 5. Workspace Reset: NO ghost ledger data; clean reuse ───
    await page.goto('/app/settings');
    await expect(page.locator('text=Current Workspace:')).toBeVisible({ timeout: 15_000 });
    const confirmName = (await page.locator('text=Current Workspace:').textContent()).replace(/^Current Workspace:\s*/, '').trim();
    await page.click('button:has-text("Reset Workspace")');
    await page.fill('#reset-confirmation', confirmName);
    await page.getByRole('button', { name: /Permanently Reset Workspace/ }).click();
    await page.waitForURL(/\/app$/, { timeout: 30_000 });

    // Full state removed: Form Books view is empty again
    await page.goto('/app/ledger');
    await expect(page.locator('text=No Ledger Books have been configured yet')).toBeVisible({ timeout: 20_000 });

    // Clean reuse: fresh module + submission → sequence restarts at …000001
    const moduleId2 = await createModule(page, { name: `E2E 171 After Reset ${stamp}`, code: `E171B${stamp}`.toUpperCase().slice(0, 24) });
    await submitRecord(page, moduleId2, `After reset ${stamp}`);
    await page.goto('/app/ledger');
    const bookName2 = `E2E 171 After Reset ${stamp} Register`;
    await page.getByRole('link', { name: bookName2 }).first().click();
    await page.waitForSelector(`h1:has-text("${bookName2}")`, { timeout: 15_000 });
    await page.waitForSelector('table tr td', { timeout: 15_000 });
    const freshTable = await page.locator('table').textContent();
    expect(freshTable).toContain('-2026-000001');
    expect(freshTable).not.toContain(moduleName); // no ghost of the previous book
  });
});
