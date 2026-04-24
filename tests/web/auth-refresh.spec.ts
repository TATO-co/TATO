import { expect, test, type Page } from '@playwright/test';

type RefreshSample = {
  path: string;
  text: string;
};

async function signInWithDevBypass(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Continue as development user' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/sign-in'), { timeout: 15_000 });
}

async function captureRefreshSamples(page: Page, count: number, intervalMs: number) {
  const samples: RefreshSample[] = [];

  await page.reload({ waitUntil: 'domcontentloaded' });

  for (let index = 0; index < count; index += 1) {
    let text = '';

    try {
      text = await page.locator('body').innerText({ timeout: 500 });
    } catch {
      text = '';
    }

    samples.push({
      path: new URL(page.url()).pathname,
      text: text.replace(/\s+/g, ' ').trim(),
    });

    await page.waitForTimeout(intervalMs);
  }

  return samples;
}

test('signed-out visitors can stay on the welcome root', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Inventory in. Cash out.', { exact: false })).toBeVisible();
});

test('signed-out protected routes still redirect to direct sign-in', async ({ page }) => {
  await page.goto('/workspace', { waitUntil: 'networkidle' });

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText('Access TATO.', { exact: false })).toBeVisible();
});

test('authenticated visitors are redirected away from public entry points', async ({ page }) => {
  await signInWithDevBypass(page);
  const preferredPath = new URL(page.url()).pathname;

  expect(['/dashboard', '/workspace']).toContain(preferredPath);

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(new RegExp(`${preferredPath.replace('/', '\\/')}$`), { timeout: 15_000 });

  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${preferredPath.replace('/', '\\/')}$`), { timeout: 15_000 });
});

test('authenticated refresh stays out of auth recovery screens', async ({ page }) => {
  await signInWithDevBypass(page);

  await page.goto('/workspace', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/workspace$/);

  const samples = await captureRefreshSamples(page, 25, 100);

  expect(samples.some((sample) => /\/(sign-in|persona-setup|account-suspended|session-error)$/.test(sample.path))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('Workspace Setup'))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('Account Suspended'))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('Session Recovery'))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('We couldn\'t restore your workspace.'))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('TATO Boot'))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('Initializing session and workspace routes.'))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('TATO ACCESS'))).toBeFalsy();
  expect(samples.some((sample) => sample.text.includes('Inventory in. Cash out.'))).toBeFalsy();

  await expect(page).toHaveURL(/\/workspace$/);
});

test('authenticated deep links survive reload without snapping to the preferred root', async ({ page }) => {
  await signInWithDevBypass(page);
  const preferredPath = new URL(page.url()).pathname;

  await page.goto('/claims', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/claims$/, { timeout: 15_000 });
  await expect(page.getByText('Claim Desk', { exact: false })).toBeVisible();

  const samples = await captureRefreshSamples(page, 25, 100);

  expect(samples.some((sample) => sample.path === preferredPath)).toBeFalsy();
  expect(samples.some((sample) => /\/(sign-in|persona-setup|account-suspended|session-error)$/.test(sample.path))).toBeFalsy();

  await expect(page).toHaveURL(/\/claims$/);
});
