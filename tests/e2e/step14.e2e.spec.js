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
 * A canonical Record CREATE must go through recordCommand; a direct browser
 * document CREATE (Firestore REST POST into the records collection) must never
 * appear. DRAFT updates (PATCH) through the legacy client-authoritative path
 * are assessed separately, so methods are tracked.
 */
function trackRecordTraffic(page) {
  const traffic = { recordCommandCalls: 0, directRecordCreates: [], directRecordUpdates: [] };
  page.on('requestfinished', (request) => {
    const url = request.url();
    if (url.includes('recordCommand')) {
      traffic.recordCommandCalls += 1;
      return;
    }
    if (url.includes('googleapis.com') && url.includes('/documents/workspaces/') && url.includes('/records/')) {
      if (request.method() === 'POST') traffic.directRecordCreates.push(url);
      if (request.method() === 'PATCH') traffic.directRecordUpdates.push(url);
    }
  });
  return traffic;
}

test.describe('Step 14 Record UX hardening', () => {
  test('detail, copy (trusted new Record), draft edit + autosave, list search/filter', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, user2Email, user2Password);

    const stamp = Date.now();
    const moduleName = `E2E Step14 Module ${stamp}`;
    const moduleCode = `E2E14${stamp}`;

    // 1. Create and publish an ACTIVE Module (text + date-range)
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name', { timeout: 10_000 });
    await page.fill('#designer-name', moduleName);
    await page.fill('#designer-code', moduleCode);
    await page.click('button:has-text("Add Text")');
    await page.click('button:has-text("Add Date Range")');
    const labels = page.getByLabel('Label');
    await labels.nth(0).fill('Title');
    await labels.nth(1).fill('Period');

    await page.click('button:has-text("Publish Module")');
    await page.waitForSelector(`text=${moduleName}`, { timeout: 20_000 });
    const moduleId = page.url().split('/').pop();
    expect(moduleId).not.toBe('new');

    // 2. Submit a submitted-state Record through the trusted path
    await page.goto(`/app/modules/${moduleId}/form`);
    await page.waitForSelector('#field-title', { timeout: 10_000 });

    const traffic = trackRecordTraffic(page);

    await page.fill('#field-title', `Step14 Original ${stamp}`);
    await page.fill('[aria-label="Period from"]', '2026-09-01');
    await page.fill('[aria-label="Period till"]', '2026-09-05');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Record Created', { timeout: 20_000 });

    await Promise.all([
      page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 }),
      page.click('text=View Record'),
    ]);
    const originalDetailUrl = page.url();
    const originalRecordId = originalDetailUrl.split('/').pop();

    // 3. Record Detail hardening assertions
    await page.waitForSelector('text=Rendered using Module Version', { timeout: 10_000 });
    const body = await page.textContent('body');
    expect(body).toContain(`Step14 Original ${stamp}`);
    expect(body).toContain('SUBMITTED');
    expect(body).toContain('September 1, 2026');
    expect(body).toContain(moduleName);
    // Actions exist; Edit draft hidden for SUBMITTED records
    await expect(page.getByRole('button', { name: 'Create copy' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible();
    expect(await page.getByRole('link', { name: 'Edit draft' }).count()).toBe(0);

    // 4. Create copy → prefilled form → trusted CREATE of a NEW canonical Record
    await page.click('button:has-text("Create copy")');
    await page.waitForURL(`/app/modules/${moduleId}/form`, { timeout: 10_000 });
    await page.waitForSelector(`text=Pre-filled with values copied`, { timeout: 10_000 });
    await expect(page.locator('#field-title')).toHaveValue(`Step14 Original ${stamp}`);

    await page.fill('#field-title', `Step14 Copy ${stamp}`);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Record Created', { timeout: 20_000 });

    await Promise.all([
      page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 }),
      page.click('text=View Record'),
    ]);
    await page.waitForSelector('text=Rendered using Module Version', { timeout: 10_000 });
    await page.waitForSelector(`text=Step14 Copy ${stamp}`, { timeout: 10_000 });
    const copyRecordId = page.url().split('/').pop();
    expect(copyRecordId).not.toBe(originalRecordId);
    expect(await page.textContent('body')).toContain(`Step14 Copy ${stamp}`);

    // Original Record unchanged
    await page.goto(originalDetailUrl);
    await page.waitForSelector('text=Rendered using Module Version', { timeout: 10_000 });
    expect(await page.textContent('body')).toContain(`Step14 Original ${stamp}`);
    expect(await page.textContent('body')).not.toContain(`Step14 Copy ${stamp}`);

    // 5. Draft save → Edit draft → autosave persists to the SAME Record
    await page.goto(`/app/modules/${moduleId}/form`);
    await page.waitForSelector('#field-title', { timeout: 10_000 });
    await page.fill('#field-title', `Step14 Draft ${stamp}`);
    await page.click('button:has-text("Save Draft")');
    await page.waitForSelector('text=Draft Saved', { timeout: 20_000 });
    await Promise.all([
      page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 }),
      page.click('text=View Record'),
    ]);
    const draftDetailUrl = page.url();
    await page.waitForSelector('text=DRAFT', { timeout: 10_000 });

    await page.click('a:has-text("Edit draft")');
    await page.waitForURL(/\/edit$/, { timeout: 10_000 });
    await page.waitForSelector('text=Changes update the same Draft Record', { timeout: 10_000 });
    await page.fill('#field-title', `Step14 Draft Edited ${stamp}`);
    await page.waitForSelector('text=All changes saved', { timeout: 15_000 });

    const draftRecordId = page.url().split('/records/')[1].replace('/edit', '');
    await page.goto(`/app/records/${draftRecordId}`);
    await page.waitForSelector('text=Rendered using Module Version', { timeout: 10_000 });
    expect(await page.textContent('body')).toContain(`Step14 Draft Edited ${stamp}`);
    expect(draftDetailUrl).toContain(draftRecordId);

    // 6. Global Record list: search + status filter + pagination rendering
    await page.goto('/app/records');
    await page.waitForSelector('#record-search', { timeout: 15_000 });
    await page.fill('#record-search', `Step14 Copy ${stamp}`);
    await page.waitForSelector(`text=Step14 Copy ${stamp}`, { timeout: 10_000 });
    const filteredBody = await page.textContent('body');
    expect(filteredBody).toContain(`Step14 Copy ${stamp}`);
    expect(filteredBody).not.toContain(`Step14 Draft Edited ${stamp}`);

    await page.fill('#record-search', '');
    await page.selectOption('[aria-label="Status filter"]', 'SUBMITTED');
    await page.waitForSelector(`text=Step14 Copy ${stamp}`, { timeout: 10_000 });

    // 7. Trusted boundary: recordCommand used, zero direct browser Record CREATEs
    expect(traffic.recordCommandCalls).toBeGreaterThanOrEqual(2);
    expect(traffic.directRecordCreates.length).toBe(0);
  });
});
