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

/**
 * Tracks trusted-command calls vs direct Firestore Record document writes.
 * After Step 15, NO direct browser Record mutation (POST create or PATCH
 * update) may occur — every lifecycle/data mutation is server-authoritative.
 */
function trackRecordTraffic(page) {
  const traffic = { recordCommandCalls: [], directRecordCreates: [], directRecordUpdates: [] };
  page.on('requestfinished', (request) => {
    const url = request.url();
    if (url.includes('recordCommand')) {
      traffic.recordCommandCalls.push(url);
      return;
    }
    if (url.includes('googleapis.com') && url.includes('/documents/workspaces/') && url.includes('/records/')) {
      if (request.method() === 'POST') traffic.directRecordCreates.push(url);
      if (request.method() === 'PATCH') traffic.directRecordUpdates.push(url);
    }
  });
  return traffic;
}

test.describe('Step 15 — trusted record actions and lifecycle', () => {
  test('draft → trusted autosave → submit → lifecycle actions, all via recordCommand', async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, user2Email, user2Password);

    const stamp = Date.now();
    const moduleName = `E2E Step15 Module ${stamp}`;
    const moduleCode = `E2E15${stamp}`;

    // 1. Create and publish an ACTIVE Module with a required date-range field
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name', { timeout: 10_000 });
    await page.fill('#designer-name', moduleName);
    await page.fill('#designer-code', moduleCode);
    await page.fill('#designer-category', 'E2E');
    await page.click('button:has-text("Add Text")');
    await page.click('button:has-text("Add Date Range")');
    const labels = page.getByLabel('Label');
    await labels.nth(0).fill('Title');
    await labels.nth(1).fill('Period');
    // Make the Period field required so SUBMIT can be rejected before dates exist
    await page.locator('label:has-text("Required") input[type="checkbox"]').nth(1).check();

    await page.click('button:has-text("Publish Module")');
    await page.waitForSelector(`text=${moduleName}`, { timeout: 20_000 });
    const moduleId = page.url().split('/').pop();
    expect(moduleId).not.toBe('new');

    // 2. Save an INCOMPLETE draft (no Period) — allowed for drafts
    await page.goto(`/app/modules/${moduleId}/form`);
    await page.waitForSelector('#field-title', { timeout: 10_000 });
    await page.fill('#field-title', `Step15 Draft ${stamp}`);
    await page.click('button:has-text("Save Draft")');
    await page.waitForSelector('text=Draft Saved', { timeout: 20_000 });
    await Promise.all([
      page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 }),
      page.click('text=View Record'),
    ]);
    const draftUrl = page.url();
    const draftRecordId = draftUrl.split('/').pop();
    await page.waitForSelector('text=DRAFT', { timeout: 10_000 });

    // 3. Submit with missing required field → trusted server rejects, stays DRAFT
    await page.click('button:has-text("Submit record")');
    await page.waitForSelector('div[role="alert"]', { timeout: 15_000 });
    const alertText = await page.textContent('div[role="alert"]');
    expect(alertText).toMatch(/required/i);
    const stillDraft = await page.textContent('body');
    expect(stillDraft).toContain('DRAFT');

    // 4. Trusted autosave in the editor (start network tracking here)
    await page.click('a:has-text("Edit draft")');
    await page.waitForURL(/\/edit$/, { timeout: 10_000 });
    const traffic = trackRecordTraffic(page);

    await page.fill('[aria-label="Period from"]', '2026-10-01');
    await page.fill('[aria-label="Period till"]', '2026-10-05');
    await page.waitForSelector('text=All changes saved', { timeout: 15_000 });
    await page.waitForSelector('[role="status"]:has-text("All changes saved")', { timeout: 5_000 });

    // 5. Submit from the editor → trusted transition → Detail shows SUBMITTED
    await page.click('button:has-text("Submit record")');
    await page.waitForURL(draftUrl, { timeout: 20_000 });
    await page.waitForSelector('text=SUBMITTED', { timeout: 10_000 });
    // Editor is no longer offered
    expect(await page.locator('a:has-text("Edit draft")').count()).toBe(0);
    expect(await page.locator('button:has-text("Submit record")').count()).toBe(0);

    // 6. History reflects the trusted lifecycle actions
    const detailBody = await page.textContent('body');
    expect(detailBody).toContain('Submitted');

    // 7. Archive via confirm dialog → ARCHIVED; Restore → back to SUBMITTED
    await page.click('button:has-text("Archive")');
    await page.locator('[role="dialog"] button:has-text("Archive")').click();
    await page.waitForSelector('text=ARCHIVED', { timeout: 15_000 });
    await page.click('button:has-text("Restore")');
    await page.waitForSelector('text=SUBMITTED', { timeout: 15_000 });

    // 8. Reload persistence: the Record is permanently SUBMITTED (canonical)
    await page.reload();
    await page.waitForSelector('text=SUBMITTED', { timeout: 15_000 });

    // 9. Trusted boundary: recordCommand used for every mutation,
    //    zero direct browser Record CREATE or UPDATE (PATCH) writes
    expect(traffic.recordCommandCalls.length).toBeGreaterThanOrEqual(3);
    expect(traffic.directRecordCreates.length).toBe(0);
    expect(traffic.directRecordUpdates.length).toBe(0);

    // 10. Everything happened on ONE canonical Record
    expect(page.url()).toContain(draftRecordId);
  });
});
