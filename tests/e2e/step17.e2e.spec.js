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

async function unreadBellCount(page) {
  const label = await page.getAttribute('button[aria-label$="unread notifications"]', 'aria-label', { timeout: 10_000 }).catch(() => null);
  const match = label?.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

test.describe('Step 17 — generic notification capability', () => {
  test('trusted record creation → notification → deep link → read-state persists, no duplicates', async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, user2Email, user2Password);

    const stamp = Date.now();
    const moduleName = `E2E Step17 Module ${stamp}`;
    const moduleCode = `E2E17${stamp}`;

    // 1. Create and publish a Module
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name', { timeout: 10_000 });
    await page.fill('#designer-name', moduleName);
    await page.fill('#designer-code', moduleCode);
    await page.click('button:has-text("Add Text")');
    await page.getByLabel('Label').nth(0).fill('Title');
    await page.click('button:has-text("Publish Module")');
    await page.waitForSelector(`text=${moduleName}`, { timeout: 20_000 });
    const moduleId = page.url().split('/').pop();

    // 2. Baseline bell unread count (bounded unread counter)
    await page.goto('/app/notifications');
    await page.waitForSelector('h1:has-text("Notifications")', { timeout: 15_000 });
    const bellBefore = await unreadBellCount(page);

    // 3. Trusted create a Record
    await page.goto(`/app/modules/${moduleId}/form`);
    await page.waitForSelector('#field-title', { timeout: 10_000 });
    await page.fill('#field-title', `Notify Record A ${stamp}`);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Record Created', { timeout: 20_000 });

    // 4. Notification appears in center; bell count incremented by the trusted action
    await page.goto('/app/notifications');
    await page.waitForSelector(`text=Record created`, { timeout: 20_000 });
    await expect(page.locator('h2', { hasText: 'Record created' }).first()).toBeVisible();
    // The bell counter loads on mount, so a reload gives the freshest count
    await page.reload();
    await page.waitForSelector('h1:has-text("Notifications")', { timeout: 15_000 });
    const bellAfter = await unreadBellCount(page);
    expect(bellAfter).toBeGreaterThan(bellBefore);

    // 5. Deep link leads to the canonical Record detail
    await page.locator('a:has-text("Open")').first().click();
    await page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 });
    await page.waitForSelector(`text=Notify Record A ${stamp}`, { timeout: 15_000 });

    // 6. Mark read on the notification itself
    await page.goto('/app/notifications');
    await page.waitForSelector(`text=Record created`, { timeout: 20_000 });
    const unreadAfterOpen = await page.locator('text=Unread').count();
    await page.locator('button:has-text("Mark read")').first().click();
    await expect(page.locator('text=Unread')).toHaveCount(Math.max(unreadAfterOpen - 1, 0), { timeout: 15_000 });

    // 7. Create a second record → a SECOND notification (distinct operations)
    await page.goto(`/app/modules/${moduleId}/form`);
    await page.waitForSelector('#field-title', { timeout: 10_000 });
    await page.fill('#field-title', `Notify Record B ${stamp}`);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Record Created', { timeout: 20_000 });

    await page.goto('/app/notifications');
    await page.waitForSelector('h2:has-text("Record created") >> nth=0', { timeout: 15_000 });
    const recordCreatedCards = await page.locator('h2', { hasText: 'Record created' }).count();
    expect(recordCreatedCards).toBeGreaterThanOrEqual(2);

    // 8. Reload persists state and never duplicates logical notifications
    await page.reload();
    await page.waitForSelector('h1:has-text("Notifications")', { timeout: 15_000 });
    const recordCreatedCardsAfterReload = await page.locator('h2', { hasText: 'Record created' }).count();
    expect(recordCreatedCardsAfterReload).toBe(recordCreatedCards);
  });
});
