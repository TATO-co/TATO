import { expect, test, type Locator, type Page, type ViewportSize } from '@playwright/test';
import { PNG } from 'pngjs';

type RouteExpectation = {
  name: string;
  path: string;
  visibleTexts: string[];
};

const viewportMatrix: Array<{ name: string; viewport: ViewportSize }> = [
  {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
  },
  {
    name: 'phone',
    viewport: { width: 390, height: 844 },
  },
];

const routeExpectations: RouteExpectation[] = [
  {
    name: 'sign-in',
    path: '/sign-in',
    visibleTexts: ['TATO ACCESS', 'Access TATO.'],
  },
  {
    name: 'persona-setup',
    path: '/persona-setup',
    visibleTexts: ['Workspace Setup', 'Choose how you want to use TATO.', 'TATO ACCESS'],
  },
  {
    name: 'account-suspended',
    path: '/account-suspended',
    visibleTexts: ['Account Suspended', 'This account is currently suspended.', 'TATO ACCESS'],
  },
  {
    name: 'configuration-required',
    path: '/configuration-required',
    visibleTexts: ['Runtime Setup', 'This build is not ready for operator access.'],
  },
  {
    name: 'session-error',
    path: '/session-error',
    visibleTexts: ['Session Recovery', 'We couldn\'t restore your workspace.'],
  },
  {
    name: 'root',
    path: '/',
    visibleTexts: ['Where raw intake becomes broker conviction.', 'Enter Workspace'],
  },
  {
    name: 'modal',
    path: '/modal',
    visibleTexts: ['TATO ACCESS', 'Access TATO.'],
  },
  {
    name: 'not-found',
    path: '/this-route-does-not-exist',
    visibleTexts: ['Screen not found', 'TATO ACCESS', 'Access TATO.'],
  },
  {
    name: 'workspace-entry',
    path: '/workspace',
    visibleTexts: ['TATO ACCESS', 'Access TATO.'],
  },
];

type ScreenshotMetrics = {
  brightTopRatio: number;
  whiteBottomRatio: number;
};

async function findMeaningfulLocator(page: Page, texts: string[]): Promise<Locator> {
  for (const text of texts) {
    const locator = page.getByText(text, { exact: false }).first();

    try {
      await locator.waitFor({ state: 'visible', timeout: 3_000 });
      return locator;
    } catch {
      // Try the next candidate because some routes legitimately redirect to sign-in.
    }
  }

  throw new Error(`None of the expected texts became visible: ${texts.join(', ')}`);
}

async function expectLocatorInViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();

  const resolvedBox = box!;
  const resolvedViewport = viewport!;

  expect(resolvedBox.width).toBeGreaterThan(0);
  expect(resolvedBox.height).toBeGreaterThan(0);
  expect(resolvedBox.x + resolvedBox.width).toBeGreaterThan(0);
  expect(resolvedBox.y + resolvedBox.height).toBeGreaterThan(0);
  expect(resolvedBox.x).toBeLessThan(resolvedViewport.width);
  expect(resolvedBox.y).toBeLessThan(resolvedViewport.height);
}

function analyzeScreenshot(buffer: Buffer): ScreenshotMetrics {
  const png = PNG.sync.read(buffer);
  const topBoundary = Math.floor(png.height * 0.7);
  const bottomBoundary = Math.floor(png.height * 0.75);

  let brightTopPixels = 0;
  let topPixels = 0;
  let whiteBottomPixels = 0;
  let bottomPixels = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) * 4;
      const red = png.data[index] ?? 0;
      const green = png.data[index + 1] ?? 0;
      const blue = png.data[index + 2] ?? 0;
      const alpha = png.data[index + 3] ?? 0;

      if (alpha < 16) {
        continue;
      }

      const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);

      if (y < topBoundary) {
        topPixels += 1;
        if (luminance >= 175) {
          brightTopPixels += 1;
        }
      }

      if (y >= bottomBoundary) {
        bottomPixels += 1;
        if (
          luminance >= 245
          && Math.abs(red - green) <= 6
          && Math.abs(green - blue) <= 6
        ) {
          whiteBottomPixels += 1;
        }
      }
    }
  }

  return {
    brightTopRatio: topPixels ? brightTopPixels / topPixels : 0,
    whiteBottomRatio: bottomPixels ? whiteBottomPixels / bottomPixels : 0,
  };
}

async function captureRoute(page: Page, route: RouteExpectation) {
  await page.goto(route.path, { waitUntil: 'networkidle' });
  const locator = await findMeaningfulLocator(page, route.visibleTexts);
  await expectLocatorInViewport(page, locator);
  return locator;
}

for (const viewportCase of viewportMatrix) {
  test.describe(`${viewportCase.name} root visibility`, () => {
    test.use({ viewport: viewportCase.viewport });

    for (const route of routeExpectations) {
      test(`keeps ${route.name} content in the viewport`, async ({ page }) => {
        await captureRoute(page, route);
      });

      test(`keeps ${route.name} from collapsing into a blank fallback`, async ({ page }) => {
        await captureRoute(page, route);

        const screenshot = await page.screenshot();
        const metrics = analyzeScreenshot(screenshot);

        expect(metrics.brightTopRatio).toBeGreaterThan(0.0006);
        expect(metrics.whiteBottomRatio).toBeLessThan(0.35);
      });
    }
  });
}
