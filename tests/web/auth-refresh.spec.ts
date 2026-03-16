import { expect, test, type Page } from '@playwright/test';

type RefreshSample = {
  path: string;
  text: string;
};

async function signInWithDevBypass(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
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
  expect(samples.some((sample) => sample.text.includes('TATO ACCESS'))).toBeFalsy();

  await expect(page).toHaveURL(/\/workspace$/);
});
