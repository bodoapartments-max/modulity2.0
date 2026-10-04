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
 * Network tracking for the trusted boundary: canonical Ledger and Record
 * mutation paths must only be hit through the callable functions, never via
 * direct browser Firestore writes.
 */
function trackTrustedTraffic(page) {
  const traffic = {
    ledgerCommandCalls: [], recordCommandCalls: [],
    directLedgerWrites: [], directRecordWrites: [], directAuditWrites: [],
  };
  page.on('requestfinished', (request) => {
    const url = request.url();
    const method = request.method();

    // Trusted callables (cloudfunctions.net) vs direct Firestore REST
    // (googleapis.com …/documents/…) writes by the browser.
    if (url.includes('cloudfunctions.net')) {
      if (url.includes('ledgerCommand')) traffic.ledgerCommandCalls.push(url);
      else if (url.includes('recordCommand')) traffic.recordCommandCalls.push(url);
      return;
    }
    if (!url.includes('googleapis.com') || !url.includes('/documents/')) return;
    if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') return;
    if (url.includes('/ledgerEntries') || url.includes('/ledgerBooks') || url.includes('/ledgerCodes')) {
      traffic.directLedgerWrites.push(url);
    } else if (url.includes('/auditEntries')) {
      traffic.directAuditWrites.push(url);
    } else if (url.includes('/records/')) {
      traffic.directRecordWrites.push(url);
    }
  });
  return traffic;
}

test.describe('Step 16 — trusted Ledger & Audit backend', () => {
  test('book creation + record registration + audit history, all server-authoritative', async ({ page }) => {
    test.setTimeout(240_000);
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    await signIn(page, user2Email, user2Password);

    const stamp = Date.now();
    const moduleName = `E2E Step16 Module ${stamp}`;
    const moduleCode = `E2E16${stamp}`;

    // 1. Create + publish an ACTIVE Module
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name', { timeout: 10_000 });
    await page.fill('#designer-name', moduleName);
    await page.fill('#designer-code', moduleCode);
    await page.click('button:has-text("Add Text")');
    await page.getByLabel('Label').nth(0).fill('Title');
    await page.click('button:has-text("Publish Module")');
    await page.waitForSelector(`text=${moduleName}`, { timeout: 20_000 });
    const moduleId = page.url().split('/').pop();

    const traffic = trackTrustedTraffic(page);

    // 2. Create a Ledger Book through the trusted CREATE_LEDGER_BOOK
    await page.goto('/app/ledger/new');
    await page.waitForSelector('input[type="text"]', { timeout: 10_000 });
    await page.fill('input[type="text"] >> nth=0', `E2E Register ${stamp}`);
    await page.fill('input[type="text"] >> nth=1', `REG${stamp}`.slice(0, 24).toUpperCase());
    // The create button stays disabled until the workspace context resolves
    await expect(page.getByRole('button', { name: 'Create Ledger Book' })).toBeEnabled({ timeout: 15_000 });
    await page.click('button:has-text("Create Ledger Book")');
    // '/app/ledger/new' matches /app/ledger/.+ — require a real book id
    await page.waitForURL((url) => /\/app\/ledger\/(?!new$)[^/]+$/.test(url.pathname), { timeout: 20_000 });
    const ledgerBookId = page.url().split('/').pop();
    expect(ledgerBookId.startsWith('lb_')).toBe(true);

    // Probe: the Ledger list must show the trusted-created book
    await page.goto('/app/ledger');
    await page.waitForSelector(`text=E2E Register ${stamp}`, { timeout: 15_000 });

    // 3. Create a submitted Record through the trusted CREATE_RECORD
    await page.goto(`/app/modules/${moduleId}/form`);
    await page.waitForSelector('#field-title', { timeout: 10_000 });
    await page.fill('#field-title', `Registered Record ${stamp}`);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Record Created', { timeout: 20_000 });
    await Promise.all([
      page.waitForURL(/\/app\/records\/.+/, { timeout: 10_000 }),
      page.click('text=View Record'),
    ]);
    await page.waitForSelector('text=SUBMITTED', { timeout: 10_000 });
    const recordUrl = page.url();

    // 4. Register the Record into the Ledger through the trusted command
    await page.waitForSelector('button:has-text("Register in Ledger")', { timeout: 15_000 });
    await page.selectOption('select[aria-label="Ledger book"]', { label: `E2E Register ${stamp}` });
    await page.click('button:has-text("Register in Ledger")');

    // Record Detail now shows the server-derived reference
    await page.waitForSelector('text=/REG[0-9A-Z]+-2026-[0-9]{6}/', { timeout: 20_000 });
    const detailBody = await page.textContent('body');
    const referenceMatch = detailBody.match(/REG[0-9A-Z]+-2026-\d{6}/);
    expect(referenceMatch).not.toBeNull();

    // History gained exactly one "Registered in Ledger" entry
    await expect(page.locator('text=Registered in Ledger')).toHaveCount(1);

    // 5. Ledger Book page shows the same canonical entry
    await page.click('a:has-text("View Book")');
    await page.waitForSelector(`text=${referenceMatch[0]}`, { timeout: 20_000 });

    // 6. Back on the Record: registration panel is replaced by the linkage card,
    //    and a reload must not duplicate the history entry (idempotent evidence)
    await page.goto(recordUrl);
    await page.waitForSelector(`text=${referenceMatch[0]}`, { timeout: 15_000 });
    await page.reload();
    await page.waitForSelector('text=Record Created', { state: 'detached', timeout: 5_000 }).catch(() => {});
    await expect(page.locator('text=Registered in Ledger')).toHaveCount(1);

    // 7. Trusted boundary: no direct browser Ledger/Audit/Record writes at all
    expect(traffic.ledgerCommandCalls.length).toBeGreaterThanOrEqual(1);
    expect(traffic.recordCommandCalls.length).toBeGreaterThanOrEqual(1);
    expect(traffic.directLedgerWrites.length).toBe(0);
    expect(traffic.directRecordWrites.length).toBe(0);
    expect(traffic.directAuditWrites.length).toBe(0);
  });
});
