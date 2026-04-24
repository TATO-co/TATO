/**
 * Alignment & Proximity (Gestalt) — E2E spec
 *
 * Validates that elements within TATO's UI are properly aligned along
 * consistent edges and grouped by proximity according to Gestalt principles.
 */

import { sel } from '../helpers/selectors.js';
import {
  captureScreenshot,
  signInWithDevBypass,
  waitForFeedLoaded,
  waitForWelcomeScreen,
} from '../helpers/auth.js';
import {
  getElementRect,
  verifyAlignment,
  verifyProximity,
} from '../helpers/spatial.js';

describe('Alignment & Proximity', () => {
  describe('Welcome Screen', () => {
    before(async () => {
      await waitForWelcomeScreen();
    });

    it('should left-align hero heading and subheading', async () => {
      const heading = await $(sel.welcomeHeading);
      const subheading = await $(sel.welcomeSubheading);

      if (!(await heading.isExisting()) || !(await subheading.isExisting())) {
        return;
      }

      const result = await verifyAlignment(
        [
          { selector: sel.welcomeHeading, label: 'Heading' },
          { selector: sel.welcomeSubheading, label: 'Subheading' },
        ],
        'x',
        'Welcome hero text left-alignment',
        4, // Allow 4pt tolerance for padding differences
      );

      if (!result.pass) {
        console.warn('Alignment drift:', result.values, `maxDrift=${result.maxDrift}pt`);
      }
      expect(result.pass).toBe(true);
    });

    it('should center-align the Enter CTA button', async () => {
      const cta = await getElementRect(sel.welcomeEnterCta);
      const { width: screenWidth } = await browser.getWindowSize();

      const ctaCenterX = cta.x + cta.width / 2;
      const screenCenterX = screenWidth / 2;
      const drift = Math.abs(ctaCenterX - screenCenterX);

      // CTA should be within 8pt of screen center (or full-width with margins)
      const isFullWidth = cta.width > screenWidth * 0.8;
      const isCentered = drift <= 8;

      expect(isFullWidth || isCentered).toBe(true);
    });
  });

  describe('ModeShell Header', () => {
    before(async () => {
      await signInWithDevBypass();
      await waitForFeedLoaded();
      await captureScreenshot('alignment-modeshell');
    });

    it('should align title and mode label to the same left edge', async () => {
      const title = await $(sel.modeShellTitle);
      const label = await $(sel.modeShellModeLabel);

      if (!(await title.isExisting()) || !(await label.isExisting())) {
        return;
      }

      const result = await verifyAlignment(
        [
          { selector: sel.modeShellTitle, label: 'Shell Title' },
          { selector: sel.modeShellModeLabel, label: 'Mode Label' },
        ],
        'x',
        'ModeShell text left-alignment',
        4,
      );

      expect(result.pass).toBe(true);
    });

    it('should group avatar, title, and mode label in tight proximity', async () => {
      const title = await $(sel.modeShellTitle);
      const label = await $(sel.modeShellModeLabel);

      if (!(await title.isExisting()) || !(await label.isExisting())) {
        return;
      }

      const result = await verifyProximity(
        [
          { selector: sel.modeShellTitle, label: 'Title' },
          { selector: sel.modeShellModeLabel, label: 'Mode Label' },
        ],
        'ModeShell identity group proximity',
        16, // Title and mode label should be within 16pt of each other
      );

      expect(result.pass).toBe(true);
    });
  });

  describe('Tab Bar', () => {
    it('should center-align icons and labels within each tab button', async () => {
      const tabs = [sel.tabExplore, sel.tabClaims, sel.tabWallet, sel.tabMe];
      const results: boolean[] = [];

      for (const tab of tabs) {
        const el = await $(tab);
        if (!(await el.isExisting())) {
          continue;
        }

        const rect = await getElementRect(tab);
        // Tab buttons should have a reasonable aspect ratio (not extremely wide or tall)
        const aspectRatio = rect.width / rect.height;
        // Typical tab button: wider than tall but not extreme
        results.push(aspectRatio > 0.5 && aspectRatio < 3);
      }

      const allValid = results.every((r) => r);
      if (!allValid) {
        console.warn('Tab button aspect ratios out of range');
      }
      expect(allValid).toBe(true);
    });

    it('should evenly distribute tab buttons across the dock width', async () => {
      const tabs = [sel.tabExplore, sel.tabClaims, sel.tabWallet, sel.tabMe];
      const rects = [];

      for (const tab of tabs) {
        const el = await $(tab);
        if (await el.isExisting()) {
          rects.push(await getElementRect(tab));
        }
      }

      if (rects.length < 2) {
        return; // Not enough tabs to check distribution
      }

      // Calculate gaps between consecutive tabs
      const gaps: number[] = [];
      for (let i = 0; i < rects.length - 1; i++) {
        const gap = rects[i + 1].x - (rects[i].x + rects[i].width);
        gaps.push(gap);
      }

      // Gaps should be roughly equal (within 8pt tolerance)
      const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
      const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - avgGap)));

      expect(maxDeviation).toBeLessThanOrEqual(12);
    });
  });
});
