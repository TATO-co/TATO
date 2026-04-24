import { sel, selByIdPrefix } from '../helpers/selectors.js';
import {
  captureScreenshot,
  getCurrentWorkspaceMode,
  signInWithDevBypass,
  waitForFeedLoaded,
  type WorkspaceMode,
} from '../helpers/auth.js';

const tabsByMode: Record<WorkspaceMode, string[]> = {
  broker: [sel.tabExplore, sel.tabClaims, sel.tabWallet, sel.tabMe],
  supplier: [sel.tabHome, sel.tabStock, sel.tabIntake, sel.tabStats, sel.tabMe],
};

describe('Signed-In Workspace', () => {
  before(async () => {
    await signInWithDevBypass();
    await captureScreenshot('workspace-initial');
  });

  describe('Mode Shell', () => {
    it('should display the ModeShell header on phone', async () => {
      const header = await $(sel.modeShellHeader);
      await expect(header).toBeExisting();
    });

    it('should show workspace title', async () => {
      const title = await $(sel.modeShellTitle);
      await expect(title).toBeExisting();
      const text = await title.getText();
      expect(text.length).toBeGreaterThan(0);
    });

    it('should show mode label', async () => {
      const label = await $(sel.modeShellModeLabel);
      await expect(label).toBeExisting();
      const text = await label.getText();
      expect(text.toUpperCase()).toMatch(/BROKER|SUPPLIER/);
    });
  });

  describe('Tab Bar', () => {
    it('should render the active mode tabs', async () => {
      const mode = await getCurrentWorkspaceMode();
      if (!mode) {
        throw new Error('Expected a signed-in workspace mode.');
      }

      for (const selector of tabsByMode[mode]) {
        const tab = await $(selector);
        await expect(tab).toBeExisting();
      }
    });

    it('should switch to a secondary tab when tapped', async () => {
      const mode = await getCurrentWorkspaceMode();
      if (!mode) {
        throw new Error('Expected a signed-in workspace mode.');
      }

      const secondaryTab = await $(tabsByMode[mode][1]);
      await secondaryTab.click();
      await browser.pause(2000);
      await captureScreenshot(`workspace-${mode}-secondary-tab`);

      const firstTab = await $(tabsByMode[mode][0]);
      await firstTab.click();
      await browser.pause(2000);
    });
  });

  describe('Workspace Content', () => {
    it('should display primary workspace content', async () => {
      const mode = await getCurrentWorkspaceMode();
      if (!mode) {
        throw new Error('Expected a signed-in workspace mode.');
      }

      await captureScreenshot(`workspace-${mode}-loaded`);

      if (mode === 'supplier') {
        const header = await $(sel.modeShellHeader);
        await expect(header).toBeExisting();
        return;
      }

      await waitForFeedLoaded();
      const emptyState = await $(sel.feedStateContainer);
      const firstCard = await $(selByIdPrefix('swipe-card-'));

      const hasContent = (await emptyState.isExisting()) || (await firstCard.isExisting());
      expect(hasContent).toBe(true);
    });
  });
});
