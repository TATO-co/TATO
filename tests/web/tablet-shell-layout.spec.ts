import { expect, test, type Page } from '@playwright/test';

const tabletViewport = { width: 1024, height: 1366 };

type NavGeometry = {
  top: number;
  height: number;
  overflowX: string;
  overflowY: string;
  text: string;
} | null;

async function signInWithDevBypass(page: Page) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Toggle developer tools' }).click();
  await page.getByRole('button', { name: 'Continue as development user' }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/sign-in') === false, { timeout: 20_000 });

  if (page.url().endsWith('/persona-setup')) {
    await page.getByText('Both', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue Into TATO' }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/persona-setup') === false, { timeout: 20_000 });
  }
}

async function getSectionNavGeometry(page: Page, label: string): Promise<NavGeometry> {
  const link = page.getByRole('link', { name: label }).first();
  await expect(link).toBeVisible();

  return link.evaluate((element) => {
    let current: HTMLElement | null = element.parentElement;

    while (current) {
      const style = getComputedStyle(current);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        const rect = current.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          height: Math.round(rect.height),
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          text: (current.textContent || '').replace(/\s+/g, ' ').trim(),
        };
      }

      current = current.parentElement;
    }

    return null;
  });
}

test.describe('tablet shell layout', () => {
  test.use({ viewport: tabletViewport });

  test('broker tablet section nav stays compact instead of expanding into the content area', async ({ page }) => {
    await signInWithDevBypass(page);
    await page.goto('/workspace', { waitUntil: 'networkidle' });

    const nav = await getSectionNavGeometry(page, 'Explore');

    expect(nav).not.toBeNull();
    expect(nav!.top).toBeLessThan(140);
    expect(nav!.height).toBeLessThan(100);
    expect(nav!.text).toContain('Explore');
    expect(nav!.text).toContain('My Claims');
  });
});
