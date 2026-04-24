import { sharedConfig } from './wdio.shared.conf.js';
import type { Options } from '@wdio/types';
import { browser } from '@wdio/globals';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { getDevClientBootWaitMs, openIosDevClientUrl } from './helpers/dev-client.js';

function resolveIosApp(): string {
  // Expo builds into Xcode DerivedData, not ios/build/.
  const projectDir = `${process.cwd()}/ios/build/Build/Products/Debug-iphonesimulator`;
  try {
    const result = execSync(
      `find ~/Library/Developer/Xcode/DerivedData -name "TATODev.app" -path "*/Debug-iphonesimulator/*" -type d -maxdepth 6 2>/dev/null | head -1`,
      { encoding: 'utf-8' },
    ).trim();
    return result || `${projectDir}/TATODev.app`;
  } catch {
    return `${projectDir}/TATODev.app`;
  }
}

function resolveSimulatorUdid(): string {
  try {
    const result = execSync(
      `xcrun simctl list devices booted -j 2>/dev/null`,
      { encoding: 'utf-8' },
    );
    const parsed = JSON.parse(result);
    for (const runtime of Object.values(parsed.devices) as any[]) {
      for (const device of runtime) {
        if (device.state === 'Booted' && device.name?.includes('iPhone 16 Pro')) {
          return device.udid;
        }
      }
    }
  } catch { /* fall through */ }
  return '';
}

function isWebDriverAgentRunning(): boolean {
  try {
    const result = execSync(
      `curl -s http://127.0.0.1:8100/status`,
      { encoding: 'utf-8', timeout: 3000 },
    );
    return result.includes('WebDriverAgent') || result.includes('"ready"') || result.includes('"sessionId"');
  } catch {
    return false;
  }
}

const udid = resolveSimulatorUdid();
const wdaRunning = isWebDriverAgentRunning();
const prebuiltWdaPath = '/tmp/wda-build/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app';
const hasPrebuiltWda = existsSync(prebuiltWdaPath);

export const config: Options.Testrunner = {
  ...sharedConfig,
  port: 4723,
  before: async () => {
    openIosDevClientUrl(udid || 'booted');
    await browser.pause(getDevClientBootWaitMs());
  },
  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': 'iPhone 16 Pro',
      'appium:platformVersion': '26.1',
      'appium:app': resolveIosApp(),
      // Keep specs isolated so public-entry checks do not inherit signed-in app state.
      'appium:noReset': false,
      'appium:newCommandTimeout': 120,
      // Use the pre-built WDA from /tmp/wda-build when available.
      ...(hasPrebuiltWda
        ? {
            'appium:derivedDataPath': '/tmp/wda-build',
            'appium:usePrebuiltWDA': true,
          }
        : {}),
      ...(wdaRunning
        ? {
            // Connect to an already-running WDA on port 8100.
            'appium:webDriverAgentUrl': 'http://127.0.0.1:8100',
            'appium:usePreinstalledWDA': true,
          }
        : {}),
      // Provide the simulator UDID to skip device enumeration.
      ...(udid ? { 'appium:udid': udid } : {}),
      // Increase WDA startup timeout since first boot can be slow.
      'appium:wdaLaunchTimeout': 120_000,
      'appium:wdaConnectionTimeout': 120_000,
      // Reduce screenshot overhead
      'appium:screenshotQuality': 1,
    } as WebdriverIO.Capabilities,
  ],
} as Options.Testrunner;
