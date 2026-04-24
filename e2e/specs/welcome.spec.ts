import { sel } from '../helpers/selectors.js';
import {
  waitForWelcomeScreen,
  captureScreenshot,
  findAfterScrolling,
  scrollUp,
  verifyTapTargetSize,
} from '../helpers/auth.js';

async function scrollWelcomeToTop() {
  await scrollUp();
  await scrollUp();
  await browser.pause(300);
}

describe('Welcome Screen', () => {
  before(async () => {
    await waitForWelcomeScreen();
    await captureScreenshot('welcome-initial');
  });

  it('should display the hero heading', async () => {
    const heading = await $(sel.welcomeHeading);
    await expect(heading).toBeExisting();
    const text = await heading.getText();
    expect(text).toContain('Inventory in');
  });

  it('should display the subheading', async () => {
    const subheading = await $(sel.welcomeSubheading);
    await expect(subheading).toBeExisting();
    const text = await subheading.getText();
    expect(text).toContain('camera');
  });

  it('should render the brand mark', async () => {
    const brandMark = await $(sel.welcomeBrandMark);
    await expect(brandMark).toBeExisting();
  });

  it('should render the Direct Sign-In button', async () => {
    const signInBtn = await $(sel.welcomeSignInButton);
    await expect(signInBtn).toBeExisting();
    await expect(signInBtn).toBeEnabled();
  });

  it('should render the Enter TATO CTA', async () => {
    const enterCta = await $(sel.welcomeEnterCta);
    await expect(enterCta).toBeExisting();
    await expect(enterCta).toBeEnabled();
  });

  it('should render both role action cards', async () => {
    const supplier = await findAfterScrolling(sel.welcomeRoleSupplier, 10_000);
    const broker = await findAfterScrolling(sel.welcomeRoleBroker, 10_000);
    await expect(supplier).toBeExisting();
    await expect(broker).toBeExisting();
  });

  it('should render market signal pills', async () => {
    await scrollWelcomeToTop();
    const listings = await $(sel.welcomeSignalListings);
    const claims = await $(sel.welcomeSignalClaims);
    const payout = await $(sel.welcomeSignalPayout);
    await expect(listings).toBeExisting();
    await expect(claims).toBeExisting();
    await expect(payout).toBeExisting();
  });

  it('should have adequate tap targets on interactive elements', async () => {
    await scrollWelcomeToTop();

    const results = [];
    results.push(await verifyTapTargetSize(sel.welcomeSignInButton, 'Direct Sign-In'));
    results.push(await verifyTapTargetSize(sel.welcomeEnterCta, 'Enter TATO CTA'));
    results.push(await verifyTapTargetSize(sel.welcomeRoleSupplier, 'Supplier Card', { scrollIntoView: true }));
    results.push(await verifyTapTargetSize(sel.welcomeRoleBroker, 'Broker Card', { scrollIntoView: true }));

    const failures = results.filter((r) => !r.pass);
    if (failures.length) {
      console.warn('Tap target size violations:', failures);
    }
    expect(failures.length).toBe(0);
  });

  it('should navigate to sign-in when Enter TATO is tapped', async () => {
    const enterCta = await findAfterScrolling(sel.welcomeEnterCta);
    await enterCta.click();
    await browser.pause(2000);

    // Verify we landed on sign-in
    const routeTag = await $(sel.signinRouteTag);
    await routeTag.waitForExist({ timeout: 10_000 });
    await expect(routeTag).toBeExisting();

    await captureScreenshot('welcome-to-signin');

    // Navigate back
    const backBtn = await $(sel.signinBackButton);
    await backBtn.click();
    await browser.pause(2000);

    // Verify we're back on welcome
    const heading = await $(sel.welcomeHeading);
    await heading.waitForExist({ timeout: 10_000 });
  });
});
