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

test('broker desk state syncs into the URL and survives reload on web', async ({ page }) => {
  await signInWithDevBypass(page);
  await page.goto('/workspace', { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Open broker search drawer' }).click();
  await page.getByPlaceholder('Search items, brands, or hubs').fill('sony');
  await page.getByRole('button', { name: 'Electronics' }).click();
  await page.getByRole('button', { name: 'Best AI' }).click();
  await page.getByRole('button', { name: 'Return to feed' }).click();

  await expect(page.getByText('Search: sony', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Electronics', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Best AI', { exact: true }).first()).toBeVisible();

  const configuredUrl = new URL(page.url());
  expect(configuredUrl.pathname).toBe('/workspace');
  expect(configuredUrl.searchParams.get('desk_q')).toBe('sony');
  expect(configuredUrl.searchParams.get('desk_sort')).toBe('Best AI');
  expect(configuredUrl.searchParams.get('desk_focus')).toContain('Electronics');

  await page.reload({ waitUntil: 'networkidle' });

  await expect(page.getByText('Search: sony', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Electronics', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Best AI', { exact: true }).first()).toBeVisible();
});
