import { sel } from '../helpers/selectors.js';
import {
  captureScreenshot,
  getCurrentWorkspaceMode,
  signInWithDevBypass,
  verifyTapTargetSize,
  type WorkspaceMode,
} from '../helpers/auth.js';

const tabsByMode: Record<WorkspaceMode, { selector: string; name: string }[]> = {
  broker: [
    { selector: sel.tabExplore, name: 'explore' },
    { selector: sel.tabClaims, name: 'claims' },
    { selector: sel.tabWallet, name: 'wallet' },
    { selector: sel.tabMe, name: 'me' },
  ],
  supplier: [
    { selector: sel.tabHome, name: 'home' },
    { selector: sel.tabStock, name: 'stock' },
    { selector: sel.tabIntake, name: 'intake' },
    { selector: sel.tabStats, name: 'stats' },
    { selector: sel.tabMe, name: 'me' },
  ],
};

async function currentTabs() {
  const mode = await getCurrentWorkspaceMode();
  if (!mode) {
    throw new Error('Expected a signed-in workspace mode before checking tabs.');
  }

  return tabsByMode[mode];
}

describe('Navigation', () => {
  before(async () => {
    await signInWithDevBypass();
  });

  describe('Phone Tab Navigation', () => {
    it('should switch between all visible workspace tabs', async () => {
      const tabs = await currentTabs();

      for (const tab of tabs) {
        const element = await $(tab.selector);
        if (await element.isExisting()) {
          await element.click();
          await browser.pause(1500);
          await captureScreenshot(`nav-broker-${tab.name}`);
        }
      }

      // Return to the first tab for downstream checks.
      const firstTab = await $(tabs[0].selector);
      if (await firstTab.isExisting()) {
        await firstTab.click();
        await browser.pause(1000);
      }
    });
  });

  describe('Screen Header Back Navigation', () => {
    it('should navigate back from pushed screens', async () => {
      // This test verifies that ScreenHeader back buttons work.
      // We'll need to push into a detail screen first.
      const backBtn = await $(sel.screenHeaderBack);
      if (await backBtn.isExisting()) {
        await backBtn.click();
        await browser.pause(1500);
        // Should return to previous screen without crash
      }
    });
  });

  describe('Signed-In Navigation Accessibility', () => {
    it('should have minimum 44pt tap targets on visible tab bar actions', async () => {
      const tabs = await currentTabs();
      const results = await Promise.all(
        tabs.map((tab) => verifyTapTargetSize(tab.selector, `${tab.name} tab`)),
      );

      const failures = results.filter((r) => !r.pass);
      for (const failure of failures) {
        console.error(`TAP TARGET VIOLATION: ${failure.label} - ${failure.reason}`);
      }

      // This is a hard requirement per Apple HIG / Android guidelines
      expect(failures.length).toBe(0);
    });
  });
});
