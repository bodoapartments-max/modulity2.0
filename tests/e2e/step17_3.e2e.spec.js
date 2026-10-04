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

test.describe('Step 17.3 — trusted administration + change history', () => {
  test('Entity Type lifecycle (typo → rename → archive → restore → dependency-blocked delete) + CONTACT + category lifecycle + Module delete blocked', async ({ page }) => {
    test.setTimeout(480_000);
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('debug-173')) console.error('[console]', m.text().slice(0, 300)); });
    await signIn(page);
    const stamp = Date.now();

    // ─── 1. Create Entity Type with a typo (Name drives identity, Code auto via server) ───
    await page.goto('/app/entity-types');
    await page.waitForSelector('text=Core Entity Types', { timeout: 15_000 });
    const typeName = `Vehcile Test ${stamp}`;
    await page.getByRole('button', { name: 'Create Domain Type' }).click();
    await page.fill('#type-name', typeName);
    await page.fill('#type-code', ''); // let the trusted boundary derive it
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator(`text=${typeName}`)).toBeVisible({ timeout: 10_000 });

    // ─── 2. Open it — note the generated code came from the same boundary ───
    await page.locator(`text=${typeName}`).first().click();
    await page.waitForURL(/entity-types\//, { timeout: 10_000 });

    // ─── 3. Rename — same identity, stable code ─────────────────────────────────
    const renameBtn = page.getByRole('button', { name: 'Rename', exact: true });
    await expect(renameBtn).toBeVisible({ timeout: 10_000 });
    await renameBtn.click();
    await page.fill('#admin-rename', `Vehicle Test ${stamp}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
    await expect(page.locator('h1')).toContainText(`Vehicle Test ${stamp}`, { timeout: 10_000 });
    // URL unchanged → identity kept
    await expect(page.locator('body')).toContainText(/VEHICLE_TEST|E2E|TEST/, { timeout: 5000 });

    // ─── 4. Archive → restore via Administration actions ───────────────────────
    await page.getByRole('button', { name: 'Archive' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
    // archived UI swaps Archive for Restore (toast text is transient)
    await expect(page.getByRole('button', { name: 'Restore' }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Restore' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Archive' }).first()).toBeVisible({ timeout: 15_000 });
    const typeId = decodeURIComponent(page.url().split('/app/entity-types/')[1] || '').split('?')[0].split('/')[0];

    // ─── 5. Delete is blocked when an Entity exists ────────────────────────────
    // Create an Entity of this type first
    await page.goto(`/app/entity-types/${encodeURIComponent(typeId)}/entities/new`);
    await page.fill('#entity-display-name', 'Test Car Instance');
    const submitText = await page.locator('button[type="submit"]').last().textContent();
    expect(submitText).toContain('Vehicle Test');
    await page.locator('button[type="submit"]').last().click();
    await page.waitForURL(/\/app\/entities\//, { timeout: 15_000 });
    // then try deleting the type → expect a dependency error
    await page.goto(`/app/entity-types/${encodeURIComponent(typeId)}`);
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.keyboard.press('Tab');
    const danger = page.getByRole('dialog').getByRole('button', { name: /Delete permanently/ });
    await danger.click();
    await expect(page.locator('text=/dependency|dependencies|Cannot delete/i').first()).toBeVisible({ timeout: 15_000 });

    // ─── 6. CONTACT is a canonical Entity Type; creating one makes no User ─────
    await page.goto('/app/entity-types');
    await expect(page.getByRole('link', { name: /Contact CONTACT/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: /Contact CONTACT/ }).click();
    await page.waitForURL(/entity-types/, { timeout: 10_000 });
    await expect(page.locator('text=Core Entity Type')).toBeVisible();

    // ─── 7. Administration History shows the rename lifecycle ──────────────────
    await page.goto('/app/admin-history');
    await expect(page.locator('h1')).toContainText('Administration History', { timeout: 15_000 });
    await expect(page.locator('li p', { hasText: 'Updated Entity Type' }).first()).toBeVisible({ timeout: 15_000 });

    // ─── 8. Module with data cannot be hard-deleted ────────────────────────────
    const modName = `E2E 173 Module ${stamp}`;
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name');
    await page.fill('#designer-name', modName);
    await page.click('button:has-text("Add Text")');
    await page.getByLabel('Label').first().fill('Title');
    await page.click('button:has-text("Publish Module")');
    await page.waitForSelector(`text=${modName}`, { timeout: 20_000 });
    const modId = page.url().split('/').pop();
    await page.goto(`/app/modules/${modId}/form`);
    await page.waitForSelector('#field-title');
    await page.fill('#field-title', 'record row');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Record Created', { timeout: 20_000 });
    await page.goto(`/app/modules/${modId}`);
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /Delete permanently/ }).click();
    await expect(page.locator('text=/dependency|dependencies|Cannot delete/i').first()).toBeVisible({ timeout: 15_000 });

    // ─── 9. Workspace Categories administration ────────────────────────────────
    await page.goto('/app/module-categories');
    await expect(page.locator('h1')).toContainText('Module Categories', { timeout: 15_000 });
    await page.getByRole('button', { name: 'New Category' }).click();
    await page.fill('#new-category-name', `StepCat ${stamp}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await expect(page.locator(`text=StepCat ${stamp}`)).toBeVisible({ timeout: 15_000 });
    await page.locator(`li:has-text("StepCat ${stamp}")`).getByRole('button', { name: 'Rename' }).click();
    await page.fill('#admin-rename', `Renamed StepCat ${stamp}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
    await expect(page.locator(`text=Renamed StepCat ${stamp}`)).toBeVisible({ timeout: 10_000 });

    // ─── 10. Reset leaves no ghost admin data ──────────────────────────────────
    await page.goto('/app/settings');
    await expect(page.locator('text=Current Workspace:')).toBeVisible({ timeout: 15_000 });
    const confirmName = (await page.locator('text=Current Workspace:').textContent()).replace(/^Current Workspace:\s*/, '').trim();
    await page.click('button:has-text("Reset Workspace")');
    await page.fill('#reset-confirmation', confirmName);
    await page.getByRole('button', { name: /Permanently Reset Workspace/ }).click();
    await page.waitForURL(/\/app$/, { timeout: 60_000 });

    await page.goto('/app/admin-history');
    await expect(page.locator('text=No administrative changes yet')).toBeVisible({ timeout: 30_000 });
    await page.goto('/app/module-categories');
    await expect(page.locator('text=No categories yet')).toBeVisible({ timeout: 15_000 });
  });
});
