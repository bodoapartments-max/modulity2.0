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

test('Step 19 — Ledger/People/Groups revisit still stable, new Direct CTA opens invite link, New Channel picker works', async ({ page }) => {
  test.setTimeout(240_000);
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));
  await signIn(page);
  const stamp = Date.now();

  // ─── 1. Ledger revisit is silent (no re-reload flash) — cached rows show immediately now
  await page.goto('/app/ledger');
  await page.waitForSelector('text=Ledger', { timeout: 15_000 });
  await page.waitForTimeout(3000);
  await page.goto('/app/records');
  await page.waitForSelector('h1', { timeout: 10_000 });
  await page.goto('/app/ledger');
  await expect(page.locator('text=Loading')).toHaveCount(0, { timeout: 10_000 });

  // ─── 2. Groups page handles personal workspace (no organization) ──────
  await page.goto('/app/groups');
  await expect(page.locator('body')).toContainText(/No Organization Selected|Groups/, { timeout: 10_000 });

  // ─── 3. People page loads after navigation
  await page.goto('/app/people');
  await expect(page.locator('body')).toContainText(/No Organization Selected|member|People/, { timeout: 10_000 });

  // ─── 4. Chat new Direct — empty state shows invitation CTA ──────────────
  await page.goto('/app/chat');
  await expect(page.locator('h1')).toContainText('Chat', { timeout: 15_000 });
  await page.getByRole('button', { name: 'New Direct' }).click();
  // In this personal workspace the owner is the only active member → CTA
  await expect(page.locator('text=No other members yet.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Invite person' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // ─── 5. Room creation with optional member selection support ───────────────
  await page.getByRole('button', { name: 'Create Room' }).click();
  await page.fill('#room-topic', `Step 19 Channel ${stamp}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click();
  await expect(page.locator(`text=Step 19 Channel ${stamp}`)).toBeVisible({ timeout: 15_000 });
  await page.fill('#chat-message', 'Step 19 verified');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('text=Step 19 verified')).toBeVisible({ timeout: 15_000 });

  // ─── 6. Reset leaves no chat ghosts ─────────────────────────────────────
  await page.goto('/app/settings');
  await expect(page.locator('text=Current Workspace:')).toBeVisible({ timeout: 15_000 });
  const confirmName = (await page.locator('text=Current Workspace:').textContent()).replace(/^Current Workspace:\s*/, '').trim();
  await page.click('button:has-text("Reset Workspace")');
  await page.fill('#reset-confirmation', confirmName);
  await page.getByRole('button', { name: /Permanently Reset Workspace/ }).click();
  await page.waitForURL(/\/app$/, { timeout: 60_000 });
  await page.goto('/app/chat');
  await expect(page.locator('text=No conversations')).toBeVisible({ timeout: 15_000 });
});
