import { expect, test, type Page } from '@playwright/test';

const phoneViewport = { width: 390, height: 844 };

async function signInWithDevBypass(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Continue as development user' }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/sign-in') === false, { timeout: 20_000 });

  if (page.url().endsWith('/persona-setup')) {
    await page.getByText('Supplier', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue Into TATO' }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/persona-setup') === false, { timeout: 20_000 });
  }

  if (!(await page.getByText('Supplier Mode', { exact: false }).first().isVisible())) {
    await page.goto('/profile', { waitUntil: 'networkidle' });

    const switchToSupplier = page.getByText('Switch to Supplier', { exact: false }).first();
    if (await switchToSupplier.isVisible()) {
      await switchToSupplier.click();
      await page.waitForURL((url) => url.pathname.endsWith('/dashboard'), { timeout: 20_000 });
    }

    await expect(page.getByText('Supplier Mode', { exact: false }).first()).toBeVisible();
  }
}

test.describe('web still-photo intake fallbacks', () => {
  test.use({ viewport: phoneViewport });

  test('keeps web still-photo intake upload-only', async ({ page }) => {
    await signInWithDevBypass(page);

    await page.goto('/intake', { waitUntil: 'networkidle' });
    await expect(page.getByText('Upload Photos', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Take Photos', { exact: false })).toHaveCount(0);

    await page.goto('/ingestion?entry=camera', { waitUntil: 'networkidle' });
    await expect(page.getByText('Awaiting Upload', { exact: false })).toBeVisible();
    await expect(page.getByText('Upload photos of the same item to begin.', { exact: false })).toBeVisible();
    await expect(page.getByText('Awaiting Capture', { exact: false })).toHaveCount(0);

    await page.goto('/live-intake', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Photo Upload/).first()).toBeVisible();
    await expect(page.getByText('Camera Capture', { exact: false })).toHaveCount(0);
  });
});
