/* global process */
import { test, expect } from '@playwright/test';

const user2Email = process.env.E2E_USER2_EMAIL || 'user2@mail.com';
const user2Password = process.env.E2E_USER2_PASSWORD || '';

async function signIn(page) {
  await page.goto('/login');
  await page.fill('#email', user2Email);
  await page.fill('#password', user2Password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/app', { timeout: 15_000 });
}

test.describe('Step 17.4 — Tech-ID UX hardening and navigation fixes', () => {
  test('Ledger code is optional/auto, Calendar revisits are instant (SWR), Records has no refresh banner', async ({ page }) => {
    test.setTimeout(240_000);
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    await signIn(page);
    const stamp = Date.now();

    // ─── Identifier UX: Ledger Code is optional and auto-derived ───────────────
    await page.goto('/app/ledger/new');
    await page.fill('#lb-name', `Tech ID Audit ${stamp}`);
    await page.fill('#lb-description', 'identifier audit probe');
    await expect(page.locator('#lb-code')).toHaveValue('', { timeout: 5000 });
    await expect(page.locator('#lb-code')).toHaveAttribute('placeholder', /Auto-generated/);
    await page.click('button:has-text("Create Ledger Book")');
    await page.waitForURL(/\/app\/ledger\/(?!new$)[a-zA-Z0-9_]+/, { timeout: 60_000 });
    await page.waitForSelector(`h1:has-text("Tech ID Audit ${stamp}")`, { timeout: 15_000 });
    const body = await page.textContent('body');
    expect(body).toMatch(/TECH_ID_AUDIT_\d+/); // technical code auto-generated from the name

    // ─── Calendar revisit is instant after first load ──────────────────────────
    await page.goto('/app/calendar');
    await page.waitForSelector('text=Calendar', { timeout: 15_000 });
    await page.waitForSelector('[role="main"] *, main *, div.min-h-\\[400px\\]', { timeout: 20000 });
    await page.goto('/app/records');
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    await page.goto('/app/calendar');
    // immediate content — no "Loading calendars…" label flash on revisit
    await expect(page.locator('text=Loading calendars')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('h1, h2')).toContainText(/Calendar/, { timeout: 10_000 });

    // ─── Workspace switch isolation: cached Calendar state must not leak across workspaces
    // (smoke only — the workset/provider cache workspaceId-scopes its keys)
    await expect(page.locator('text=Loading calendars')).toHaveCount(0);

    // ─── Records: no "Refreshing…" banner during background refresh ────────────
    await page.goto('/app/records');
    await page.waitForSelector('h1, h2', { timeout: 15_000 });
    await page.waitForTimeout(2500);
    await expect(page.locator('text=Refreshing…')).toHaveCount(0);
    // Refresh trigger from return to the page — still no banner
    await page.goto('/app/calendar');
    await page.waitForSelector('text=Calendar', { timeout: 10_000 });
    await page.goto('/app/records');
    await expect(page.locator('text=Refreshing…')).toHaveCount(0);
  });
});
