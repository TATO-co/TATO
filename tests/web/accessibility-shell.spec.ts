import { expect, test, type Page } from '@playwright/test';

async function signInWithDevBypass(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Continue as development user' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/sign-in'), { timeout: 20_000 });

  if (page.url().endsWith('/persona-setup')) {
    await page.getByText('Both', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue Into TATO' }).click();
    await page.waitForURL((url) => !url.pathname.endsWith('/persona-setup'), { timeout: 20_000 });
  }
}

test('public routes expose a skip link, main landmark, and heading structure', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Inventory in. Cash out.' })).toBeVisible();

  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Access TATO.' })).toBeVisible();
});

test('authenticated workspace routes keep the semantic shell intact', async ({ page }) => {
  await signInWithDevBypass(page);

  await page.goto('/workspace', { waitUntil: 'networkidle' });
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Explore' }).first()).toBeVisible();

  await page.goto('/live-intake', { waitUntil: 'networkidle' });
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Live Intake' }).first()).toBeVisible();
});
