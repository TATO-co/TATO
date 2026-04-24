import { sharedConfig } from './wdio.shared.conf.js';
import type { Options } from '@wdio/types';
import { browser } from '@wdio/globals';
import { execFileSync } from 'node:child_process';
import { getDevClientBootWaitMs, openAndroidDevClientUrl, resolveAdbPath } from './helpers/dev-client.js';

export const config: Options.Testrunner = {
  ...sharedConfig,
  port: 4723,
  beforeSession: () => {
    execFileSync(resolveAdbPath(), ['reverse', 'tcp:8081', 'tcp:8081'], { stdio: 'inherit' });
  },
  before: async () => {
    openAndroidDevClientUrl();
    await browser.pause(getDevClientBootWaitMs());
  },
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'emulator-5554',
      // Path to the .apk built by `npx expo run:android`
      'appium:app': `${process.cwd()}/android/app/build/outputs/apk/debug/app-debug.apk`,
      'appium:appPackage': 'com.tato.app.development',
      'appium:appActivity': '.MainActivity',
      'appium:appWaitActivity': 'com.tato.app.development.MainActivity,.MainActivity,*',
      'appium:appWaitDuration': 120_000,
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 120,
      'appium:autoGrantPermissions': true,
      'appium:disableWindowAnimation': true,
      'appium:skipUnlock': true,
      'appium:adbExecTimeout': 180_000,
      'appium:androidInstallTimeout': 120_000,
      'appium:uiautomator2ServerLaunchTimeout': 120_000,
      'appium:uiautomator2ServerInstallTimeout': 120_000,
      'appium:uiautomator2ServerReadTimeout': 180_000,
      'appium:ignoreHiddenApiPolicyError': true,
    } as WebdriverIO.Capabilities,
  ],
} as Options.Testrunner;
