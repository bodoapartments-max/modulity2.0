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

test('Step 19 v2 — Rooms, Direct invite CTA, snapshot semantics documentation', async ({ page }) => {
  test.setTimeout(240_000);
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));
  await signIn(page);
  const stamp = Date.now();

  await page.goto('/app/chat');
  await expect(page.locator('h1')).toContainText('Chat', { timeout: 15_000 });

  // ─── Direct invite CTA (no other members) ────────────────────────────────
  await page.getByRole('button', { name: 'New Direct' }).click();
  await expect(page.locator('text=No other members yet.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Invite person' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'New Channel' })).toHaveCount(0);

  // ─── Create Room dialog ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.locator('text=Create Chat Room')).toBeVisible({ timeout: 10_000 });
  await page.fill('#room-topic', `Lunch Friday ${stamp}`);
  await page.fill('#room-description', 'Weekly lunch topic');
  await expect(page.locator('text=Invite only')).toBeVisible();
  await expect(page.locator('text=Workspace visible')).toBeVisible();

  // workspace visible variant also works — choose it for coverage
  const radios = page.locator('input[name="room-visibility"]');
  await radios.nth(1).click();
  await expect(radios.nth(1)).toBeChecked();

  await page.getByRole('dialog').getByRole('button', { name: 'Create Room', exact: true }).click();
  await expect(page.locator(`text=Lunch Friday ${stamp}`)).toBeVisible({ timeout: 15_000 });
  // Badge indicates workspace visible room
  await expect(page.locator('text=WORKSPACE').first()).toBeVisible({ timeout: 10_000 });

  // context business marker should show on conversation rows
  await expect(page.locator('text=ROOM').first()).toBeVisible({ timeout: 10_000 });

  // message into the room
  await page.fill('#chat-message', 'Pizza is my choice.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('text=Pizza is my choice.')).toBeVisible({ timeout: 15_000 });

  // create an INVITE_ONLY room second time covering both visibility types
  await page.getByRole('button', { name: 'Create Room', exact: true }).click();
  await page.fill('#room-topic', `Secret lunch ${stamp}`);
  await page.locator('input[name="room-visibility"]').nth(0).click();
  await expect(page.locator('input[name="room-visibility"]').nth(0)).toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: 'Create Room', exact: true }).click();
  await expect(page.locator(`text=Secret lunch ${stamp}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('text=INVITE').first()).toBeVisible({ timeout: 10_000 });

  // Reset: does sweep include chat conversations?
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
