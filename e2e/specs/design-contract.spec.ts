/**
 * Design System Contract — Appium assertions
 *
 * Verifies the spatial, hierarchy, touch-target, and safe-area rules that
 * keep TATO aligned across iOS and Android.
 */

import { sel, selByIdPrefix } from '../helpers/selectors.js';
import {
  openSignInScreen,
  ensureWorkspaceMode,
  signInWithDevBypass,
  waitForFeedLoaded,
  waitForWelcomeScreen,
} from '../helpers/auth.js';
import {
  verifyAlignment,
  getElementRect,
  getPlatformMinimumTouchTarget,
  normalizePlatformMetric,
  verifyHeadingBodyHierarchy,
  verifyMinimumTapTargets,
  verifySafeAreaRespect,
  verifySiblingInteractiveSpacing,
} from '../helpers/spatial.js';

function expectNoFailures(results: Array<{ pass: boolean; reason: string }>) {
  const failures = results.filter((result) => !result.pass);
  if (failures.length) {
    console.warn('Design contract failures:', failures);
  }

  expect(failures.length).toBe(0);
}

async function expectButtonContained(containerSelector: string, buttonSelector: string) {
  const container = await getElementRect(containerSelector);
  const button = await getElementRect(buttonSelector);
  const minTarget = getPlatformMinimumTouchTarget();

  expect(Math.round(normalizePlatformMetric(button.height))).toBeGreaterThanOrEqual(minTarget);
  expect(button.y).toBeGreaterThanOrEqual(container.y + 8);
  expect(button.y + button.height).toBeLessThanOrEqual(container.y + container.height - 8);
  expect(button.x).toBeGreaterThanOrEqual(container.x + 8);
  expect(button.x + button.width).toBeLessThanOrEqual(container.x + container.width - 8);
}

describe('Design System Contract', () => {
  describe('Welcome CTAs', () => {
    before(async () => {
      await waitForWelcomeScreen();
    });

    it('keeps primary CTAs at the platform minimum touch target', async () => {
      const results = await verifyMinimumTapTargets([
        { selector: sel.welcomeSignInButton, label: 'Welcome direct sign-in' },
        { selector: sel.welcomeEnterCta, label: 'Welcome enter CTA' },
        { selector: sel.welcomeRoleSupplier, label: 'Supplier role card' },
        { selector: sel.welcomeRoleBroker, label: 'Broker role card' },
      ]);

      expect(results.length).toBeGreaterThan(0);
      expectNoFailures(results);
    });

    it('keeps sibling interactive cards at least 8pt apart', async () => {
      const result = await verifySiblingInteractiveSpacing(
        [
          { selector: sel.welcomeRoleSupplier, label: 'Supplier role card' },
          { selector: sel.welcomeRoleBroker, label: 'Broker role card' },
        ],
        'Welcome role card spacing',
      );

      expect(result.pass).toBe(true);
    });

    it('keeps the public top action below the top safe area', async () => {
      const result = await verifySafeAreaRespect(
        sel.welcomeSignInButton,
        'Welcome direct sign-in safe area',
        'top',
      );

      expect(result.pass).toBe(true);
    });
  });

  describe('Sign-In CTAs', () => {
    before(async () => {
      await openSignInScreen();
    });

    it('keeps sign-in actions at the platform minimum touch target', async () => {
      const results = await verifyMinimumTapTargets([
        { selector: sel.signinBackButton, label: 'Sign-in back button' },
        { selector: sel.authPrimaryAction, label: 'Auth primary action' },
        { selector: sel.authEditEmail, label: 'Edit email action' },
      ]);

      expect(results.length).toBeGreaterThan(1);
      expectNoFailures(results);
    });

    it('keeps the sign-in back action below the top safe area', async () => {
      const result = await verifySafeAreaRespect(
        sel.signinBackButton,
        'Sign-in back safe area',
        'top',
      );

      expect(result.pass).toBe(true);
    });
  });

  describe('Workspace Shell', () => {
    before(async () => {
      await signInWithDevBypass({ preferredMode: 'broker' });
      await waitForFeedLoaded();
    });

    it('keeps tab CTAs at the platform minimum touch target', async () => {
      const results = await verifyMinimumTapTargets([
        { selector: sel.tabExplore, label: 'Explore tab' },
        { selector: sel.tabClaims, label: 'Claims tab' },
        { selector: sel.tabWallet, label: 'Wallet tab' },
        { selector: sel.tabMe, label: 'Profile tab' },
      ]);

      expect(results.length).toBeGreaterThan(0);
      expectNoFailures(results);
    });

    it('keeps heading text visually distinct from shell metadata', async () => {
      const result = await verifyHeadingBodyHierarchy(
        sel.modeShellTitle,
        sel.modeShellModeLabel,
        'ModeShell heading hierarchy',
      );

      expect(result.pass).toBe(true);
    });

    it('keeps the floating dock above the bottom safe area', async () => {
      const result = await verifySafeAreaRespect(
        sel.tabExplore,
        'Explore tab bottom safe area',
        'bottom',
      );

      expect(result.pass).toBe(true);
    });

    it('keeps broker dock tabs on one optical baseline', async () => {
      const result = await verifyAlignment(
        [
          { selector: sel.tabExplore, label: 'Explore tab' },
          { selector: sel.tabClaims, label: 'Claims tab' },
          { selector: sel.tabWallet, label: 'Wallet tab' },
          { selector: sel.tabMe, label: 'Profile tab' },
        ],
        'y',
        'Broker dock tab top alignment',
        6,
      );

      expect(result.pass).toBe(true);
    });

    it('keeps the first claim CTA fully inside the claim card', async () => {
      await expectButtonContained(
        selByIdPrefix('swipe-card-'),
        selByIdPrefix('swipe-claim-'),
      );
    });
  });

  describe('Supplier Dock', () => {
    before(async () => {
      await ensureWorkspaceMode('supplier');
      await browser.pause(1500);
    });

    it('keeps supplier tab CTAs at the platform minimum touch target', async () => {
      const results = await verifyMinimumTapTargets([
        { selector: sel.tabHome, label: 'Home tab' },
        { selector: sel.tabStock, label: 'Stock tab' },
        { selector: sel.tabIntake, label: 'Intake tab' },
        { selector: sel.tabStats, label: 'Stats tab' },
        { selector: sel.tabMe, label: 'Me tab' },
      ]);

      expect(results.length).toBeGreaterThan(0);
      expectNoFailures(results);
    });

    it('keeps the supplier intake tab aligned with sibling tabs', async () => {
      const result = await verifyAlignment(
        [
          { selector: sel.tabHome, label: 'Home tab' },
          { selector: sel.tabStock, label: 'Stock tab' },
          { selector: sel.tabIntake, label: 'Intake tab' },
          { selector: sel.tabStats, label: 'Stats tab' },
          { selector: sel.tabMe, label: 'Me tab' },
        ],
        'y',
        'Supplier dock tab top alignment',
        6,
      );

      expect(result.pass).toBe(true);
    });

    it('keeps the supplier dock above the bottom safe area', async () => {
      const result = await verifySafeAreaRespect(
        sel.tabIntake,
        'Supplier intake tab bottom safe area',
        'bottom',
      );

      expect(result.pass).toBe(true);
    });

    it('keeps supplier home hero CTAs inside the queue snapshot panel', async () => {
      await expectButtonContained(
        sel.supplierQueueSnapshotPanel,
        sel.supplierLiveIntakeButton,
      );
      await expectButtonContained(
        sel.supplierQueueSnapshotPanel,
        sel.supplierOpenInventoryButton,
      );
    });

    it('keeps supplier stock hero CTAs and filters optically compact', async () => {
      const stockTab = await $(sel.tabStock);
      await stockTab.click();
      await browser.pause(1200);

      await expectButtonContained(
        sel.supplierInventoryManagementPanel,
        sel.supplierRefreshQueueButton,
      );
      await expectButtonContained(
        sel.supplierInventoryManagementPanel,
        sel.supplierOpenIntakeButton,
      );

      const filterRect = await getElementRect(sel.filterAll);
      const filterHeight = Math.round(normalizePlatformMetric(filterRect.height));
      expect(filterHeight).toBeLessThanOrEqual(getPlatformMinimumTouchTarget() + 2);
    });
  });
});
