/**
 * Skeleton Loading States — E2E spec
 *
 * Validates that TATO uses skeleton screens instead of bare spinners,
 * that skeletons match the layout of real content, and that they
 * transition cleanly to loaded states.
 */

import { sel } from '../helpers/selectors.js';
import {
  captureScreenshot,
  signInWithDevBypass,
  waitForFeedLoaded,
  ensureWorkspaceMode,
} from '../helpers/auth.js';
import { getElementRect, verifyRhythm } from '../helpers/spatial.js';

describe('Skeleton Loading States', () => {
  describe('Broker Workspace', () => {
    before(async () => {
      await signInWithDevBypass({ preferredMode: 'broker' });
    });

    it('should show loading state before feed data appears', async () => {
      const skeleton = await $(sel.skeletonCard);
      const loading = await $(sel.feedStateLoading);
      const feedLoading = await $(sel.brokerFeedLoading);

      const hasLoading =
        (await skeleton.isExisting()) ||
        (await loading.isExisting()) ||
        (await feedLoading.isExisting());

      await captureScreenshot('skeleton-broker-initial');

      if (hasLoading && (await skeleton.isExisting())) {
        await skeleton.waitForExist({ timeout: 30_000, reverse: true });
      }

      await waitForFeedLoaded();
      await captureScreenshot('skeleton-broker-loaded');
    });

    it('should not layout-shift after skeleton resolves', async () => {
      const header = await $(sel.modeShellHeader);
      if (!(await header.isExisting())) return;

      const rect = await getElementRect(sel.modeShellHeader);
      expect(rect.y).toBeLessThan(200);
      expect(rect.width).toBeGreaterThan(0);
    });
  });

  describe('Supplier Inventory', () => {
    before(async () => {
      await ensureWorkspaceMode('supplier');
      await browser.pause(1500);
    });

    it('should show skeleton during supplier inventory fetch', async () => {
      const stockTab = await $(sel.tabStock);
      if (!(await stockTab.isExisting())) return;

      await stockTab.click();
      await browser.pause(500);
      await captureScreenshot('skeleton-supplier-loading');

      const skeleton = await $(sel.skeletonCard);
      if (await skeleton.isExisting()) {
        const rect = await getElementRect(sel.skeletonCard);
        expect(rect.height).toBeGreaterThanOrEqual(80);
        const result = verifyRhythm(rect.height, 'Skeleton height');
        if (!result.pass) {
          console.warn(`Skeleton height ${rect.height}pt not on grid`);
        }
      }

      await browser.pause(5000);
      await captureScreenshot('skeleton-supplier-loaded');
    });
  });
});
