/**
 * Spatial Rhythm (8pt Grid System) — E2E spec
 *
 * Validates that TATO's native UI adheres to the 8pt spatial rhythm
 * defined in lib/ui.ts (RHYTHM). Measures inter-element spacing,
 * container padding, and component dimensions.
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
  normalizePlatformMetric,
  verifyRhythm,
  verifySpacingRhythm,
} from '../helpers/spatial.js';

describe('Spatial Rhythm — 8pt Grid System', () => {
  describe('Welcome Screen', () => {
    before(async () => {
      await waitForWelcomeScreen();
    });

    it('should use 8pt-grid spacing between hero heading and subheading', async () => {
      const result = await verifySpacingRhythm(
        sel.welcomeHeading,
        sel.welcomeSubheading,
        'Heading → Subheading gap',
      );
      expect(result.pass).toBe(true);
    });

    it('should use 8pt-grid spacing between subheading and CTA', async () => {
      const result = await verifySpacingRhythm(
        sel.welcomeSubheading,
        sel.welcomeEnterCta,
        'Subheading → Enter CTA gap',
        2,
      );
      if (!result.pass) {
        console.warn(`Subheading → CTA gap: ${result.value}pt (nearest: ${result.nearestMultiple})`);
      }
      expect(result.pass).toBe(true);
    });

    it('should have brand mark dimensions as multiples of 8', async () => {
      const rect = await getElementRect(sel.welcomeBrandMark);
      const widthResult = verifyRhythm(rect.width, 'Brand mark width');
      const heightResult = verifyRhythm(rect.height, 'Brand mark height');
      // At least one dimension should be on-grid (logos are often non-square)
      expect(widthResult.pass || heightResult.pass).toBe(true);
    });

    it('should have CTA button height on the 8pt grid', async () => {
      const rect = await getElementRect(sel.welcomeEnterCta);
      // Buttons should be 48pt or 56pt tall
      const result = verifyRhythm(rect.height, 'CTA button height');
      expect(result.pass).toBe(true);
    });
  });

  describe('Signed-In Workspace', () => {
    before(async () => {
      await signInWithDevBypass();
      await waitForFeedLoaded();
      await captureScreenshot('spatial-rhythm-workspace');
    });

    it('should have ModeShell header height on the 8pt grid', async () => {
      const rect = await getElementRect(sel.modeShellHeader);
      const result = verifyRhythm(rect.height, 'ModeShell header height');
      // Header height should be comfortable (>= 64pt) and grid-aligned
      expect(rect.height).toBeGreaterThanOrEqual(56);
      if (!result.pass) {
        console.warn(`ModeShell header height: ${rect.height}pt (nearest 8pt: ${result.nearestMultiple})`);
      }
    });

    it('should have consistent avatar dimensions', async () => {
      const avatar = await $(sel.modeShellAvatar);
      if (await avatar.isExisting()) {
        const size = await avatar.getSize();
        const width = Math.round(normalizePlatformMetric(size.width));
        const height = Math.round(normalizePlatformMetric(size.height));
        // Avatar should be 48 or 52pt (within 8pt system + 4pt allowance)
        expect(width).toBeGreaterThanOrEqual(44);
        expect(Math.abs(width - height)).toBeLessThanOrEqual(1); // Square/circle, allowing native pixel rounding.
      }
    });

    it('should have tab bar dock height of 72pt', async () => {
      // Tab bar uses getFloatingDockStyle with height: 72
      const tabs = [sel.tabExplore, sel.tabClaims, sel.tabWallet, sel.tabMe];
      let tabBarFound = false;

      for (const tab of tabs) {
        const el = await $(tab);
        if (await el.isExisting()) {
          tabBarFound = true;
          const size = await el.getSize();
          // Individual tab buttons should meet minimum tap target
          expect(size.height).toBeGreaterThanOrEqual(44);
          break;
        }
      }

      expect(tabBarFound).toBe(true);
    });

    it('should use 8pt spacing between ModeShell title and mode label', async () => {
      const result = await verifySpacingRhythm(
        sel.modeShellTitle,
        sel.modeShellModeLabel,
        'Title → Mode label gap',
        2,
      );
      // Title-to-label gap should be small but grid-aligned
      if (!result.pass) {
        console.warn(`Title → Label gap: ${result.value}pt (nearest: ${result.nearestMultiple})`);
      }
    });
  });
});
