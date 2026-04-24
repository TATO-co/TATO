import type { Options } from '@wdio/types';
import { execSync } from 'node:child_process';

const e2eRoot = `${process.cwd()}/e2e`;

function isAppiumRunning(): boolean {
  try {
    const result = execSync('curl -s http://127.0.0.1:4723/status', { encoding: 'utf-8', timeout: 3000 });
    return result.includes('"ready":true');
  } catch {
    return false;
  }
}

const appiumAlreadyRunning = isAppiumRunning();

export const sharedConfig: Partial<Options.Testrunner> = {
  runner: 'local',
  maxInstances: 1,
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000, // 2 minutes per test; native is slow.
  },
  reporters: ['spec'],
  waitforTimeout: 15_000,
  connectionRetryTimeout: 240_000,
  connectionRetryCount: 3,
  logLevel: 'warn',
  specs: [
    `${e2eRoot}/specs/welcome.spec.ts`,
    `${e2eRoot}/specs/sign-in.spec.ts`,
    `${e2eRoot}/specs/navigation.spec.ts`,
    `${e2eRoot}/specs/broker-workspace.spec.ts`,
    `${e2eRoot}/specs/design-contract.spec.ts`,
    `${e2eRoot}/specs/spatial-rhythm.spec.ts`,
    `${e2eRoot}/specs/alignment-proximity.spec.ts`,
    `${e2eRoot}/specs/elevation-depth.spec.ts`,
    `${e2eRoot}/specs/skeleton-loading.spec.ts`,
    `${e2eRoot}/specs/micro-interactions.spec.ts`,
    `${e2eRoot}/specs/empty-error-states.spec.ts`,
    `${e2eRoot}/specs/cross-platform-parity.spec.ts`,
  ],
  // If Appium is already running externally, skip the auto-start service.
  services: appiumAlreadyRunning
    ? []
    : [
        [
          'appium',
          {
            command: 'appium',
            args: {
              relaxedSecurity: true,
            },
          },
        ],
      ],
};
