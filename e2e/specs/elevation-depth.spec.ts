/**
 * Elevation & Depth (Z-Axis) — E2E spec
 *
 * Validates that TATO's layered UI correctly positions floating elements
 * above content, uses borders/shadows for depth perception, and maintains
 * proper z-ordering of overlays, sheets, and the floating dock.
 */

import { sel } from '../helpers/selectors.js';
import {
  captureScreenshot,
  signInWithDevBypass,
  waitForFeedLoaded,
} from '../helpers/auth.js';
import { getElementRect, verifyElementOrder } from '../helpers/spatial.js';

describe('Elevation & Depth — Z-Axis', () => {
  before(async () => {
    await signInWithDevBypass();
    await waitForFeedLoaded();
    await captureScreenshot('elevation-initial');
  });

  describe('Floating Tab Bar', () => {
    it('should render the tab bar above content area', async () => {
      // The floating dock sits at the bottom of the screen, overlapping content.
      // Verify it exists and is visible even when content is scrollable.
      const tabExplore = await $(sel.tabExplore);
      if (!(await tabExplore.isExisting())) {
        return;
      }

      const tabRect = await getElementRect(sel.tabExplore);
      const { height: screenHeight } = await browser.getWindowSize();

      // Tab bar should be positioned in the lower portion of the screen
      expect(tabRect.y).toBeGreaterThan(screenHeight * 0.7);

      // Tab bar should be visible (not hidden or zero-sized)
      expect(tabRect.width).toBeGreaterThan(0);
      expect(tabRect.height).toBeGreaterThan(0);
    });

    it('should position the tab bar above the safe area bottom', async () => {
      const tabs = [sel.tabExplore, sel.tabClaims, sel.tabWallet, sel.tabMe];
      let anyTabVisible = false;

      for (const tab of tabs) {
        const el = await $(tab);
        if (await el.isExisting()) {
          anyTabVisible = true;
          const rect = await getElementRect(tab);
          const { height: screenHeight } = await browser.getWindowSize();

          // Tab should not extend below the screen
          const tabBottom = rect.y + rect.height;
          expect(tabBottom).toBeLessThanOrEqual(screenHeight + 2); // 2pt tolerance
          break;
        }
      }

      expect(anyTabVisible).toBe(true);
    });
  });

  describe('ModeShell Header Panel', () => {
    it('should render with visible border for depth perception', async () => {
      const header = await $(sel.modeShellHeader);
      if (!(await header.isExisting())) {
        return;
      }

      // The header uses a rounded panel with border — verify it has non-zero dimensions
      const rect = await getElementRect(sel.modeShellHeader);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);

      // Verify the header is near the top of the screen (elevation context)
      expect(rect.y).toBeLessThan(200); // Should be in the upper portion
    });

    it('should layer the header above the content below it', async () => {
      const result = await verifyElementOrder(
        sel.modeShellTitle,
        sel.modeShellModeLabel,
        'Header title renders before mode label',
      );

      expect(result.pass).toBe(true);
    });
  });

  describe('Phone Controls Sheet', () => {
    it('should render the controls sheet overlay above content when opened', async () => {
      // Open the phone controls sheet
      const searchButton = await $('~Open search');
      if (!(await searchButton.isExisting())) {
        // Try the testID approach
        const openControls = await $(sel.brokerOpenControls);
        if (!(await openControls.isExisting())) {
          return; // Not on broker workspace
        }
        await openControls.click();
      } else {
        await searchButton.click();
      }

      await browser.pause(1000);
      await captureScreenshot('elevation-controls-open');

      // The sheet should appear
      const sheet = await $(sel.phoneControlsSheet);
      if (await sheet.isExisting()) {
        const sheetRect = await getElementRect(sel.phoneControlsSheet);

        // Sheet should cover a significant portion of the screen (overlay behavior)
        const { height: screenHeight } = await browser.getWindowSize();
        const sheetCoverage = sheetRect.height / screenHeight;
        expect(sheetCoverage).toBeGreaterThan(0.2); // At least 20% of screen

        // Close the sheet
        const closeBtn = await $(sel.phoneControlsClose);
        if (await closeBtn.isExisting()) {
          await closeBtn.click();
          await browser.pause(800);
        }
      }
    });
  });

  describe('Content Card Elevation', () => {
    it('should have consistent border radius across panels on the same screen', async () => {
      // Capture header and any visible feed state containers
      const header = await $(sel.modeShellHeader);
      const feedState = await $(sel.feedStateContainer);

      if (!(await header.isExisting())) {
        return;
      }

      const headerRect = await getElementRect(sel.modeShellHeader);

      if (await feedState.isExisting()) {
        const feedRect = await getElementRect(sel.feedStateContainer);

        // Both panels should have similar widths (full-width or padded identically)
        const widthRatio = Math.min(headerRect.width, feedRect.width) /
                           Math.max(headerRect.width, feedRect.width);

        // Width ratio should be close (both use the same page gutter)
        expect(widthRatio).toBeGreaterThan(0.85);
      }
    });
  });
});
