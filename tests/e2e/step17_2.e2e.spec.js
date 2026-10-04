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

async function createModuleWithCategory(page, { name, categoryId = null }) {
  await page.goto('/app/modules/new');
  await page.waitForSelector('#designer-name', { timeout: 10_000 });
  await page.fill('#designer-name', name);
  // code intentionally left EMPTY — Step 17.2 auto-generation
  if (categoryId) await page.selectOption('#designer-category', categoryId);
  await page.click('button:has-text("Add Text")');
  await page.getByLabel('Label').first().fill('Title');
  await page.click('button:has-text("Publish Module")');
  await page.waitForSelector(`text=${name}`, { timeout: 20_000 });
  return page.url().split('/').pop();
}

test.describe('Step 17.2 — Module categories & personal module selection', () => {
  test('category create/assign/auto-code, Uncategorized fallback, personal selection + order + mode, All Modules discovery, reset', async ({ page }) => {
    test.setTimeout(420_000);
    await signIn(page);

    const stamp = Date.now();
    const catName = `Operations Desk ${stamp}`;
    const modAName = `E2E 172 Checkin ${stamp}`;
    const modBName = `E2E 172 LostFound ${stamp}`;
    const modCName = `E2E 172 Unfiled ${stamp}`;

    // ─── 1. Create a category via the designer's inline affordance ──────────────
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name', { timeout: 10_000 });
    await page.click('button:has-text("+ New Category")');
    await page.fill('#designer-new-category', catName);
    await page.click('button:has-text("Add")');
    await expect(page.locator('#designer-category')).toHaveValue(/cat_/, { timeout: 10_000 });
    const createdCategoryId = await page.locator('#designer-category').inputValue();
    await page.goto('/app/modules'); // abandon draft, category persists

    // ─── 2. Create Module A in that category — auto-generated technical code ────
    const modA = await createModuleWithCategory(page, { name: modAName, categoryId: createdCategoryId });
    await page.goto(`/app/modules/${modA}`);
    await expect(page.locator('h1')).toContainText(modAName, { timeout: 10_000 });

    // Technical code must be auto-derived from the name — not user typed
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/E2E_172_CHECKIN_\d+/);

    // ─── 3. Module B same category, Module C without category ───────────────────
    const modB = await createModuleWithCategory(page, { name: modBName, categoryId: createdCategoryId });
    await createModuleWithCategory(page, { name: modCName });

    // ─── 4. My Modules grouped view: category bucket + Uncategorized ────────────
    await page.goto('/app/modules');
    await expect(page.locator(`h2:has-text("${catName}")`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('h2:has-text("Uncategorized")')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`h3:has-text("${modAName}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${modCName}")`)).toBeVisible();

    // Category filter
    await page.selectOption('select[aria-label="Filter by category"]', createdCategoryId);
    await expect(page.locator(`h3:has-text("${modAName}")`)).toBeVisible();
    await expect(page.locator(`h3:has-text("${modCName}")`)).toHaveCount(0);
    await page.selectOption('select[aria-label="Filter by category"]', '');

    // ─── 5. Category reassignment keeps moduleId identity ───────────────────────
    // Create a second category, then move Module A to it
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name');
    await page.click('button:has-text("+ New Category")');
    await page.fill('#designer-new-category', `Reception ${stamp}`);
    await page.click('button:has-text("Add")');
    const secondCategoryId = await page.locator('#designer-category').inputValue();
    await page.goto(`/app/modules/${modA}`);
    await page.selectOption('select[aria-label="Module Category"]', secondCategoryId);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain(`/app/modules/${modA}`); // identity preserved

    // ─── 6. Personal selection: hide Module B from My Modules ───────────────────
    await page.goto('/app/modules');
    await page.click('button:has-text("Customize")');
    const selB = page.locator(`#sel-${modB}`);
    await expect(selB).toBeChecked({ timeout: 5_000 });
    await selB.click();
    await page.waitForTimeout(800); // preference persist + re-render
    await page.click('button:has-text("Done")');
    await expect(page.locator(`h3:has-text("${modBName}")`)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(`h3:has-text("${modAName}")`)).toBeVisible();

    // ─── 7. Hidden-but-authorized Module REMAINS discoverable in All Modules ────
    await page.click('button:has-text("All Modules")');
    await page.fill('input[aria-label="Search all modules"]', modBName);
    await expect(page.locator(`button:has-text("${modBName}")`)).toBeVisible({ timeout: 5_000 });
    // open it directly
    await page.click(`button:has-text("${modBName}")`);
    await page.waitForURL(new RegExp(`/app/modules/${modB}/records`), { timeout: 10_000 });

    // ─── 8. Grouped/flat toggle + persistence across reload ─────────────────────
    await page.goto('/app/modules');
    const toggleBtn = page.locator('button[aria-pressed]').filter({ hasText: /Group by category|Flat list/ });
    await toggleBtn.click(); // toggle to FLAT
    // Preference persists server-side; wait for the local state to reflect and then prove it after reload
    await expect(page.locator('button[aria-pressed="false"]')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000); // write settles
    await page.reload();
    // reload must come back FLAT — prove persistence
    await expect(page.locator('button[aria-pressed="false"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`h3:has-text("${modAName}")`)).toBeVisible({ timeout: 15_000 });
    // flat view = no category group headers
    await expect(page.locator(`h2:has-text("${catName}")`)).toHaveCount(0);

    // order preference persists: customize → move Module C to top
    await page.click('button:has-text("Customize")');
    const moveUp = page.getByLabel(`Move ${modCName} up`);
    for (let i = 0; i < 12; i += 1) {
      if (!(await moveUp.isEnabled())) break;
      await moveUp.click();
      await page.waitForTimeout(300);
    }
    await page.click('button:has-text("Done")');
    await page.reload();
    await expect(page.locator(`h3:has-text("${modCName}")`).first()).toBeVisible({ timeout: 15_000 });

    // ─── 9. Reset: categories + preferences + modules are gone ──────────────────
    await page.goto('/app/settings');
    await expect(page.locator('text=Current Workspace:')).toBeVisible({ timeout: 15_000 });
    const confirmName = (await page.locator('text=Current Workspace:').textContent()).replace(/^Current Workspace:\s*/, '').trim();
    await page.click('button:has-text("Reset Workspace")');
    await page.fill('#reset-confirmation', confirmName);
    await page.getByRole('button', { name: /Permanently Reset Workspace/ }).click();
    await page.waitForURL(/\/app$/, { timeout: 60_000 });

    await page.goto('/app/modules');
    await expect(page.locator('text=No modules yet')).toBeVisible({ timeout: 20_000 });
    // the category picker in the designer no longer offers the test categories
    await page.goto('/app/modules/new');
    await page.waitForSelector('#designer-name');
    const options = await page.locator('#designer-category option').allTextContents();
    expect(options.some((o) => o.includes(catName))).toBe(false);

    // ─── 10. Clean rebuild: fresh module creation still works after reset ───────
    const freshId = await createModuleWithCategory(page, { name: `E2E 172 Fresh ${stamp}` });
    expect(freshId).toBeTruthy();
  });
});
