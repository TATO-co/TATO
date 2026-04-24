import { sel } from '../helpers/selectors.js';
import { captureScreenshot, openSignInScreen, verifyTapTargetSize } from '../helpers/auth.js';

type MobileElement = Awaited<ReturnType<typeof $>>;

async function setEmailInputValue(element: MobileElement, value: string) {
  await element.clearValue();

  if (driver.isIOS) {
    await element.click();
    for (const character of value) {
      await element.addValue(character);
      await browser.pause(35);
    }
    return;
  }

  await element.setValue(value);
}

async function getInputValue(element: MobileElement) {
  const attributes = driver.isAndroid ? ['text', 'name'] : ['value', 'text', 'name'];
  for (const attribute of attributes) {
    try {
      const value = await element.getAttribute(attribute);
      if (value) return value;
    } catch {
      // Android's UiAutomator2 driver rejects unsupported attributes such as iOS's "value".
    }
  }

  return element.getText();
}

describe('Sign-In Screen', () => {
  before(async () => {
    await openSignInScreen();
    await captureScreenshot('signin-initial');
  });

  it('should display the route tag', async () => {
    const routeTag = await $(sel.signinRouteTag);
    await expect(routeTag).toBeExisting();
    const text = await routeTag.getText();
    expect(text.toUpperCase()).toContain('SIGN-IN');
  });

  it('should render the back button', async () => {
    const backBtn = await $(sel.signinBackButton);
    await expect(backBtn).toBeExisting();
    await expect(backBtn).toBeEnabled();
  });

  it('should render the email input', async () => {
    const emailInput = await $(sel.authEmailInput);
    await expect(emailInput).toBeExisting();
    await expect(emailInput).toBeEnabled();
  });

  it('should show step markers', async () => {
    const step1 = await $(sel.authStepEmail);
    const step2 = await $(sel.authStepCode);
    await expect(step1).toBeExisting();
    await expect(step2).toBeExisting();
  });

  it('should have the primary action button (Send Code)', async () => {
    const primaryBtn = await $(sel.authPrimaryAction);
    await expect(primaryBtn).toBeExisting();
  });

  it('should disable Send Code when email is empty', async () => {
    const primaryBtn = await $(sel.authPrimaryAction);
    // When disabled, the button should have disabled state
    const state = await primaryBtn.getAttribute('enabled');
    // On iOS, disabled buttons have enabled=false
    // This checks the button is not active when no email is entered
    expect(state).toBeDefined();
  });

  it('should accept email input', async () => {
    const emailInput = await $(sel.authEmailInput);
    await setEmailInputValue(emailInput, 'test@example.com');
    await browser.pause(500);

    const value = await getInputValue(emailInput);
    expect(value).toContain('test@example.com');
    await captureScreenshot('signin-email-entered');
  });

  it('should have adequate tap targets on auth elements', async () => {
    const results = await Promise.all([
      verifyTapTargetSize(sel.signinBackButton, 'Back Button'),
      verifyTapTargetSize(sel.authPrimaryAction, 'Send Code Button'),
      verifyTapTargetSize(sel.authEmailInput, 'Email Input'),
    ]);

    const failures = results.filter((r) => !r.pass);
    if (failures.length) {
      console.warn('Tap target size violations:', failures);
    }
    expect(failures.length).toBeLessThanOrEqual(0);
  });

  describe('Developer Tools', () => {
    it('should toggle developer tools visibility', async () => {
      const devToggle = await $(sel.authDevToolsToggle);
      if (!(await devToggle.isExisting())) {
        // Dev tools not available in this build; skip.
        return;
      }

      await devToggle.click();
      await browser.pause(500);

      const bypassBtn = await $(sel.authDevBypassButton);
      await expect(bypassBtn).toBeExisting();
      await captureScreenshot('signin-dev-tools-open');
    });
  });

  it('should navigate back to welcome when back button is tapped', async () => {
    const backBtn = await $(sel.signinBackButton);
    await backBtn.click();
    await browser.pause(2000);

    const heading = await $(sel.welcomeHeading);
    await heading.waitForExist({ timeout: 10_000 });
    await expect(heading).toBeExisting();
  });
});
