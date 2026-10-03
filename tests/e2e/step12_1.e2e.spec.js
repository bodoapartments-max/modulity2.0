/* global process */
import { test, expect } from '@playwright/test';

const user2Email = process.env.E2E_USER2_EMAIL || 'user2@mail.com';
const user2Password = process.env.E2E_USER2_PASSWORD || '';
const user3Email = process.env.E2E_USER3_EMAIL || 'user3@mail.com';
const user3Password = process.env.E2E_USER3_PASSWORD || '';
const user4Email = process.env.E2E_USER4_EMAIL || 'user4@mail.com';
const user4Password = process.env.E2E_USER4_PASSWORD || '';

async function signIn(page, email, password) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/app', { timeout: 15_000 });
}

async function readWorkspaceSwitchers(page) {
  await page.click('[aria-label^="Current workspace:"]');
  // Allow dropdown to render and capture workspace names
  await page.waitForTimeout(300);
  const items = await page.$$eval('[role="menuitem"] span.truncate, [role="menuitem"] .truncate', (els) => els.map((el) => el.textContent.trim()));
  return items;
}

test.describe('Step 12.1 live auth exploration', () => {
  test('User 2 logs in and lands in a Personal workspace', async ({ page }) => {
    await signIn(page, user2Email, user2Password);
    await expect(page).toHaveURL('/app');
    await page.waitForSelector('[aria-label^="Current workspace:"]', { timeout: 10_000 });
    const current = await page.textContent('[aria-label^="Current workspace:"]');
    console.log('User 2 current workspace:', current);
    const items = await readWorkspaceSwitchers(page);
    console.log('User 2 available workspaces:', items);
    expect(current).toContain('Personal');
  });

  test('User 3 logs in and lands in a Personal workspace', async ({ page }) => {
    await signIn(page, user3Email, user3Password);
    await expect(page).toHaveURL('/app');
    await page.waitForSelector('[aria-label^="Current workspace:"]', { timeout: 10_000 });
    const current = await page.textContent('[aria-label^="Current workspace:"]');
    console.log('User 3 current workspace:', current);
    const items = await readWorkspaceSwitchers(page);
    console.log('User 3 available workspaces:', items);
    expect(current).toContain('Personal');
  });

  test('User 4 logs in and lands in a Personal workspace', async ({ page }) => {
    await signIn(page, user4Email, user4Password);
    await expect(page).toHaveURL('/app');
    await page.waitForSelector('[aria-label^="Current workspace:"]', { timeout: 10_000 });
    const current = await page.textContent('[aria-label^="Current workspace:"]');
    console.log('User 4 current workspace:', current);
    const items = await readWorkspaceSwitchers(page);
    console.log('User 4 available workspaces:', items);
    expect(current).toContain('Personal');
  });

  test('User 2 and User 3 sessions are isolated (different Firebase Auth IDs)', async ({ browser }) => {
    const context2 = await browser.newContext();
    const context3 = await browser.newContext();
    const page2 = await context2.newPage();
    const page3 = await context3.newPage();
    await signIn(page2, user2Email, user2Password);
    await signIn(page3, user3Email, user3Password);
    const header2 = await page2.textContent('header');
    const header3 = await page3.textContent('header');
    expect(header2).toContain('user2@mail.com');
    expect(header3).toContain('user3@mail.com');
    await context2.close();
    await context3.close();
  });

  test('trusted Record submission path through the browser in a personal workspace', async ({ page }) => {
    await signIn(page, user2Email, user2Password);

    const stamp = Date.now();
    const moduleName = `E2E Trusted Submission ${stamp}`;
    const moduleCode = `E2E${stamp}`;

    // 1. Create and publish an ACTIVE Module
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name', { timeout: 10_000 });
    await page.fill('#designer-name', moduleName);
    await page.fill('#designer-code', moduleCode);
    await page.fill('#designer-category', 'E2E');

    await page.click('button:has-text("Add Text")');
    await page.click('button:has-text("Add Date Range")');
    await page.click('button:has-text("Add Date & Time Range")');

    const labels = page.getByLabel('Label');
    await labels.nth(0).fill('Title');
    await labels.nth(1).fill('Period');
    await labels.nth(2).fill('Appointment');

    await page.click('button:has-text("Publish Module")');
    await page.waitForSelector(`text=${moduleName}`, { timeout: 20_000 });
    const moduleUrl = page.url();
    const moduleId = moduleUrl.split('/').pop();
    expect(moduleId).not.toBe('new');
    console.log('Published module:', moduleId);

    // 2. Submit a Record through the Module form
    await page.goto(`/app/modules/${moduleId}/form`);
    await page.waitForSelector('text=Record Created', { state: 'hidden', timeout: 5_000 }).catch(() => {});
    await page.fill('#field-title', 'Trusted Browser Record');
    await page.fill('[aria-label="Period from"]', '2026-08-01');
    await page.fill('[aria-label="Period till"]', '2026-08-07');
    await page.fill('[aria-label="Appointment from"]', '2026-08-01T09:00');
    await page.fill('[aria-label="Appointment till"]', '2026-08-01T10:00');

    const requests = [];
    page.on('requestfinished', (request) => {
      requests.push(request.url());
    });

    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Record Created', { timeout: 20_000 });

    // 3. Verify the network path used recordCommand, not a direct Firestore records write
    const recordCommandCalls = requests.filter((url) => url.includes('recordCommand'));
    const directRecordWrites = requests.filter((url) => url.includes('googleapis.com') && url.includes('/documents/workspaces/') && url.includes('/records/'));
    console.log('recordCommand calls:', recordCommandCalls.length);
    console.log('direct record writes:', directRecordWrites.length);
    expect(recordCommandCalls.length).toBeGreaterThanOrEqual(1);
    expect(directRecordWrites.length).toBe(0);

    // 4. View Record Detail
    await Promise.all([
      page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 }),
      page.click('text=View Record'),
    ]);
    await page.waitForSelector('text=Rendered using Module Version', { timeout: 10_000 });
    const recordId = page.url().split('/').pop();
    const body = await page.textContent('body');
    expect(body).toContain('Trusted Browser Record');
    expect(body).toContain('August 1, 2026');
    expect(body).toContain('Appointment');

    // 5. Verify Module Record List
    await page.goto(`/app/modules/${moduleId}/records`);
    await page.waitForSelector('text=Trusted Browser Record', { timeout: 15_000 });
    const listBody = await page.textContent('body');
    expect(listBody).toContain('Trusted Browser Record');

    // 6. Cross-user isolation: User 4 cannot see User 2's canonical Record
    const recordUrl = page.url().replace(`/modules/${moduleId}/records`, `/records/${recordId}`);
    const browser = page.context().browser();
    const user4Context = await browser.newContext();
    const user4Page = await user4Context.newPage();
    await signIn(user4Page, user4Email, user4Password);
    await user4Page.goto(recordUrl);
    await user4Page.waitForSelector('text=Record not found', { timeout: 10_000 });
    await user4Context.close();
  });
});
