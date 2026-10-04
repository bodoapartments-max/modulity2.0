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

test('Step 18 — workspace chat + context conversations', async ({ page }) => {
  test.setTimeout(360_000);
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));
  await signIn(page);
  const stamp = Date.now();

  // ─── 1. Chat page loads ─────────────────────────────────────────────────────
  await page.goto('/app/chat');
  await expect(page.locator('h1')).toContainText('Chat', { timeout: 15_000 });

  // ─── 2. Channel creation ─────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'New Channel' }).click();
  await page.fill('#channel-title', `Ops Team ${stamp}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect(page.locator(`text=Ops Team ${stamp}`)).toBeVisible({ timeout: 15_000 });

  // ─── 3. Send a message into the created channel ─────────────────────────────
  await expect(page.locator('text=No messages')).toBeVisible({ timeout: 15_000 });
  await page.fill('#chat-message', 'First hello from Step 18');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('text=First hello from Step 18')).toBeVisible({ timeout: 15_000 });

  // ─── 4. Contextual conversation from a Record page ──────────────────────────
  // Create a module + record to have a canonical object to discuss.
  const modName = `E2E 18 Chat Target ${stamp}`;
  await page.goto('/app/modules/new');
  await page.waitForSelector('#designer-name');
  await page.fill('#designer-name', modName);
  await page.click('button:has-text("Add Text")');
  await page.getByLabel('Label').first().fill('Text');
  await page.click('button:has-text("Publish Module")');
  await page.waitForSelector(`text=${modName}`, { timeout: 20_000 });
  const modId = page.url().split('/').pop();
  await page.goto(`/app/modules/${modId}/form`);
  await page.waitForSelector('#field-text');
  await page.fill('#field-text', 'chat target record');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Record Created', { timeout: 20_000 });

  // Open the new Record detail via the success screen.
  await page.getByRole('link', { name: 'View Record' }).click();
  await page.waitForURL(/\/app\/records\/[a-zA-Z_0-9-]+/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Discuss' }).click();
  await page.waitForURL(/\/app\/chat\?c=/, { timeout: 15_000 });
  await expect(page.getByText('CONTEXT').first()).toBeVisible({ timeout: 15_000 });
  await page.fill('#chat-message', 'Please check this record');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('text=Please check this record')).toBeVisible({ timeout: 15_000 });

  // ─── 5. Workspace-reset ghost check for chat artifacts ──────────────────────
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
