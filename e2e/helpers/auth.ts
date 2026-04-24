import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

import { sel } from './selectors.js';
import { getPlatformMinimumTouchTarget, normalizePlatformMetric } from './spatial.js';

export type WorkspaceMode = 'broker' | 'supplier';

const ANDROID_APP_ID = 'com.tato.app.development';

function resolveAdbPath() {
  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? `${homedir()}/Library/Android/sdk`;
  const adbPath = `${sdkRoot}/platform-tools/adb`;
  return existsSync(adbPath) ? adbPath : 'adb';
}

async function resetAndroidAppToPublicEntry() {
  if (!driver.isAndroid) {
    return false;
  }

  try {
    await driver.terminateApp(ANDROID_APP_ID);
  } catch {
    // The app may already be stopped.
  }

  try {
    const adb = resolveAdbPath();
    execFileSync(adb, ['shell', 'pm', 'clear', ANDROID_APP_ID], { stdio: 'ignore' });
    execFileSync(adb, ['reverse', 'tcp:8081', 'tcp:8081'], { stdio: 'ignore' });
    await driver.activateApp(ANDROID_APP_ID);
    await browser.pause(2500);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the sign-in route from the welcome screen.
 */
export async function openSignInScreen() {
  const routeTag = await $(sel.signinRouteTag);
  if (await routeTag.isExisting()) {
    return;
  }

  const directSignIn = await $(sel.welcomeSignInButton);
  if (await directSignIn.isExisting()) {
    await directSignIn.click();
  } else {
    const enterButton = await $(sel.welcomeEnterCta);
    await enterButton.waitForExist({ timeout: 20_000 });
    await enterButton.click();
  }

  await routeTag.waitForExist({ timeout: 10_000 });
}

export async function getCurrentWorkspaceMode() {
  const modeLabel = await $(sel.modeShellModeLabel);
  if (!(await modeLabel.isExisting())) {
    return null;
  }

  const text = (await modeLabel.getText()).toLowerCase();
  if (text.includes('broker')) {
    return 'broker';
  }

  if (text.includes('supplier')) {
    return 'supplier';
  }

  return null;
}

export async function ensureWorkspaceMode(mode: WorkspaceMode) {
  const currentMode = await getCurrentWorkspaceMode();
  if (currentMode === mode) {
    return;
  }

  const profileTab = await $(sel.tabMe);
  await profileTab.waitForExist({ timeout: 15_000 });
  try {
    await profileTab.click();
  } catch (error) {
    if (driver.isAndroid && profileTab.elementId) {
      await driver.execute('mobile: clickGesture', { elementId: profileTab.elementId });
    } else {
      throw error;
    }
  }
  await browser.pause(1600);

  const targetSelector = mode === 'broker' ? sel.profileSwitchBroker : sel.profileSwitchSupplier;
  if (!(await $(targetSelector).isExisting())) {
    const location = await profileTab.getLocation();
    const size = await profileTab.getSize();
    await tapAt(
      Math.round(location.x + size.width / 2),
      Math.round(location.y + size.height / 2),
    );
    await browser.pause(1600);
  }

  let switchButton: Awaited<ReturnType<typeof findAfterScrolling>>;
  try {
    switchButton = await findAfterScrolling(targetSelector, 15_000);
  } catch (error) {
    await captureScreenshot(`workspace-switch-${mode}-missing`);
    await capturePageSource(`workspace-switch-${mode}-missing`);
    throw error;
  }
  await switchButton.click();

  await browser.waitUntil(
    async () => (await getCurrentWorkspaceMode()) === mode,
    {
      timeout: 20_000,
      timeoutMsg: `Expected workspace mode to switch to ${mode}`,
    },
  );
}

export async function findAfterScrolling(selector: string, timeout = 2_000) {
  const element = await $(selector);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await element.isExisting()) {
      return element;
    }

    await scrollDown();
    await browser.pause(300);
  }

  await element.waitForExist({ timeout });
  return element;
}

/**
 * Performs the dev bypass sign-in flow.
 *
 * Prerequisites:
 * - The app must be on the welcome or sign-in screen.
 * - EXPO_PUBLIC_DEV_BYPASS_EMAIL and EXPO_PUBLIC_DEV_BYPASS_PASSWORD must be set.
 */
export async function signInWithDevBypass(options: { preferredMode?: WorkspaceMode } = {}) {
  const existingShell = await $(sel.modeShellHeader);
  if (await existingShell.isExisting()) {
    if (options.preferredMode) {
      await ensureWorkspaceMode(options.preferredMode);
    }
    return;
  }

  await openSignInScreen();

  let bypassButton = await $(sel.authDevBypassButton);
  if (!(await bypassButton.isExisting())) {
    let devToolsToggle: Awaited<ReturnType<typeof findAfterScrolling>>;
    try {
      devToolsToggle = await findAfterScrolling(sel.authDevToolsToggle, 10_000);
    } catch (error) {
      await captureScreenshot('signin-dev-toggle-missing');
      await capturePageSource('signin-dev-toggle-missing');
      throw error;
    }
    await devToolsToggle.click();
    await browser.pause(500);
    bypassButton = await findAfterScrolling(sel.authDevBypassButton, 5_000);
  }

  await bypassButton.click();

  // Wait for workspace to load; the mode shell header appearing is our signal.
  const modeShellHeader = await $(sel.modeShellHeader);
  try {
    await modeShellHeader.waitForExist({ timeout: 45_000 });
  } catch (error) {
    const authError = await $(sel.authError);
    if (await authError.isExisting()) {
      throw new Error(`Dev bypass failed: ${await authError.getText()}`);
    }

    await captureScreenshot('signin-dev-bypass-timeout');
    await capturePageSource('signin-dev-bypass-timeout');
    throw error;
  }

  if (options.preferredMode) {
    await ensureWorkspaceMode(options.preferredMode);
  }
}

/**
 * Waits for the welcome screen to fully render.
 */
export async function waitForWelcomeScreen() {
  const heading = await $(sel.welcomeHeading);
  if (await heading.isExisting()) {
    return;
  }

  const shell = await $(sel.modeShellHeader);
  if (await shell.isExisting()) {
    await resetAndroidAppToPublicEntry();
    if (await heading.isExisting()) {
      return;
    }
  }

  const backButton = await $(sel.signinBackButton);
  if (await backButton.isExisting()) {
    await backButton.click();
    await browser.pause(1200);
  }

  await heading.waitForExist({ timeout: 20_000 });
}

/**
 * Waits for any loading/spinner states to resolve.
 */
export async function waitForFeedLoaded() {
  // Wait for the loading indicator to disappear
  const loading = await $(sel.brokerFeedLoading);
  if (await loading.isExisting()) {
    await loading.waitForExist({ timeout: 30_000, reverse: true });
  }
  // Additional settle time for animations
  await browser.pause(800);
}

/**
 * Captures a screenshot and saves it with a descriptive name.
 */
export async function captureScreenshot(name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await browser.saveScreenshot(`./e2e/screenshots/${name}-${timestamp}.png`);
}

export async function capturePageSource(name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(`./e2e/screenshots/${name}-${timestamp}.xml`, await browser.getPageSource());
}

/**
 * Scrolls down on the current screen.
 * Works with both iOS and Android.
 */
export async function scrollDown() {
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width / 2);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y: Math.round(height * 0.7) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 120 },
        { type: 'pointerMove', duration: 450, x, y: Math.round(height * 0.3) },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

async function tapAt(x: number, y: number) {
  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 80 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Scrolls up on the current screen.
 */
export async function scrollUp() {
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width / 2);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y: Math.round(height * 0.3) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 120 },
        { type: 'pointerMove', duration: 450, x, y: Math.round(height * 0.7) },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
}

/**
 * Verifies an element has the platform minimum recommended tap target size.
 */
export async function verifyTapTargetSize(selector: string, label: string, options: { scrollIntoView?: boolean } = {}) {
  const element = options.scrollIntoView ? await findAfterScrolling(selector) : await $(selector);
  if (!(await element.isExisting())) {
    return { label, pass: false, reason: 'Element not found' };
  }

  const size = await element.getSize();
  const minSize = getPlatformMinimumTouchTarget();
  const width = Math.round(normalizePlatformMetric(size.width));
  const height = Math.round(normalizePlatformMetric(size.height));
  const pass = width >= minSize && height >= minSize;

  return {
    label,
    pass,
    width,
    height,
    reason: pass
      ? 'OK'
      : `Too small: ${width}x${height} (minimum ${minSize}x${minSize})`,
  };
}
