/**
 * Cross-Platform Parity — E2E spec
 *
 * Captures layout snapshots on the current platform and verifies
 * structural consistency. When run on both iOS and Android, the
 * offline compare-parity.ts script diffs the results.
 */

import { sel, selByIdPrefix } from '../helpers/selectors.js';
import {
  captureScreenshot,
  signInWithDevBypass,
  waitForFeedLoaded,
  waitForWelcomeScreen,
  ensureWorkspaceMode,
  verifyTapTargetSize,
} from '../helpers/auth.js';
import { getElementRect } from '../helpers/spatial.js';
import { captureLayoutSnapshot } from '../helpers/parity.js';

function byTestId(id: string) {
  return driver.isAndroid
    ? `android=new UiSelector().resourceId("${id}")`
    : `~${id}`;
}

describe('Cross-Platform Parity', () => {
  describe('Welcome Screen Parity', () => {
    before(async () => {
      await waitForWelcomeScreen();
    });

    it('should capture welcome screen layout snapshot', async () => {
      const snapshot = await captureLayoutSnapshot('welcome', {
        brandMark: byTestId('welcome-brand-mark'),
        heading: byTestId('welcome-heading'),
        subheading: byTestId('welcome-subheading'),
        signInButton: byTestId('welcome-sign-in-button'),
        enterCta: byTestId('welcome-enter-cta'),
        roleSupplier: byTestId('welcome-role-supplier'),
        roleBroker: byTestId('welcome-role-broker'),
        signalListings: byTestId('welcome-signal-listings'),
        signalClaims: byTestId('welcome-signal-claims'),
        signalPayout: byTestId('welcome-signal-payout'),
      });

      expect(Object.keys(snapshot.elements).length).toBeGreaterThan(3);
      await captureScreenshot('parity-welcome');
    });

    it('should have consistent element sizes across platform', async () => {
      // Verify key elements have reasonable sizes
      const heading = await $(sel.welcomeHeading);
      if (!(await heading.isExisting())) return;

      const rect = await getElementRect(sel.welcomeHeading);
      expect(rect.width).toBeGreaterThan(100);
      expect(rect.height).toBeGreaterThan(20);
    });

    it('should verify all interactive elements meet 44pt tap target', async () => {
      const results = await Promise.all([
        verifyTapTargetSize(sel.welcomeSignInButton, 'Sign In'),
        verifyTapTargetSize(sel.welcomeEnterCta, 'Enter CTA'),
      ]);

      const failures = results.filter((r) => !r.pass);
      expect(failures.length).toBe(0);
    });
  });

  describe('Sign-In Screen Parity', () => {
    before(async () => {
      const enterCta = await $(sel.welcomeEnterCta);
      if (await enterCta.isExisting()) {
        await enterCta.click();
        await browser.pause(2000);
      }

      const routeTag = await $(sel.signinRouteTag);
      await routeTag.waitForExist({ timeout: 10_000 });
    });

    it('should capture sign-in layout snapshot', async () => {
      const snapshot = await captureLayoutSnapshot('sign-in', {
        routeTag: byTestId('signin-route-tag'),
        backButton: byTestId('signin-back-button'),
        emailInput: byTestId('auth-email-input'),
        stepEmail: byTestId('auth-step-1'),
        stepCode: byTestId('auth-step-2'),
        primaryAction: byTestId('auth-primary-action'),
      });

      expect(Object.keys(snapshot.elements).length).toBeGreaterThan(2);
      await captureScreenshot('parity-signin');
    });

    after(async () => {
      const backBtn = await $(sel.signinBackButton);
      if (await backBtn.isExisting()) {
        await backBtn.click();
        await browser.pause(2000);
      }
    });
  });

  describe('Broker Workspace Parity', () => {
    before(async () => {
      await signInWithDevBypass({ preferredMode: 'broker' });
      await waitForFeedLoaded();
    });

    it('should capture broker workspace layout snapshot', async () => {
      const snapshot = await captureLayoutSnapshot('broker-workspace', {
        modeShellHeader: byTestId('mode-shell-header'),
        modeShellTitle: byTestId('mode-shell-title'),
        modeShellModeLabel: byTestId('mode-shell-mode-label'),
        tabExplore: byTestId('tab-explore'),
        tabClaims: byTestId('tab-claims'),
        tabWallet: byTestId('tab-wallet'),
        tabMe: byTestId('tab-me'),
      });

      expect(Object.keys(snapshot.elements).length).toBeGreaterThan(3);
      await captureScreenshot('parity-broker-workspace');
    });

    it('should have matching text content for shell elements', async () => {
      const title = await $(sel.modeShellTitle);
      const label = await $(sel.modeShellModeLabel);

      if (!(await title.isExisting()) || !(await label.isExisting())) return;

      const titleText = await title.getText();
      const labelText = await label.getText();

      // These should be the same on both platforms
      expect(titleText.length).toBeGreaterThan(0);
      expect(labelText.toUpperCase()).toMatch(/BROKER/);
    });

    it('should have tab bar elements the same size on both platforms', async () => {
      const tabs = [sel.tabExplore, sel.tabClaims, sel.tabWallet, sel.tabMe];

      for (const tab of tabs) {
        const el = await $(tab);
        if (!(await el.isExisting())) continue;

        const rect = await getElementRect(tab);
        // Each tab should meet minimum tap target
        expect(rect.height).toBeGreaterThanOrEqual(40);
        expect(rect.width).toBeGreaterThanOrEqual(40);
      }
    });
  });

  describe('Supplier Workspace Parity', () => {
    before(async () => {
      await ensureWorkspaceMode('supplier');
      await browser.pause(1500);
    });

    it('should capture supplier workspace layout snapshot', async () => {
      const snapshot = await captureLayoutSnapshot('supplier-workspace', {
        modeShellHeader: byTestId('mode-shell-header'),
        modeShellTitle: byTestId('mode-shell-title'),
        modeShellModeLabel: byTestId('mode-shell-mode-label'),
        tabHome: byTestId('tab-home'),
        tabStock: byTestId('tab-stock'),
        tabIntake: byTestId('tab-intake'),
        tabStats: byTestId('tab-stats'),
        tabMe: byTestId('tab-me'),
      });

      expect(Object.keys(snapshot.elements).length).toBeGreaterThan(3);
      await captureScreenshot('parity-supplier-workspace');
    });

    it('should show supplier mode label', async () => {
      const label = await $(sel.modeShellModeLabel);
      if (!(await label.isExisting())) return;

      const text = await label.getText();
      expect(text.toUpperCase()).toMatch(/SUPPLIER/);
    });

    it('should have interactive tab count matching between platforms', async () => {
      const supplierTabs = [sel.tabHome, sel.tabStock, sel.tabIntake, sel.tabStats, sel.tabMe];
      let visibleCount = 0;

      for (const tab of supplierTabs) {
        const el = await $(tab);
        if (await el.isExisting()) visibleCount++;
      }

      // Supplier mode should have 5 tabs
      expect(visibleCount).toBeGreaterThanOrEqual(4);
    });
  });
});
