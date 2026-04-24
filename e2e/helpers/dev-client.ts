import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export const E2E_APP_ID = process.env.E2E_APP_ID ?? 'com.tato.app.development';

const E2E_APP_SCHEME = process.env.E2E_APP_SCHEME ?? 'tato-development';
const E2E_METRO_URL = process.env.E2E_METRO_URL ?? 'http://127.0.0.1:8081';

export function getDevClientUrl() {
  return `${E2E_APP_SCHEME}://expo-development-client/?url=${encodeURIComponent(E2E_METRO_URL)}`;
}

export function resolveAdbPath() {
  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? `${homedir()}/Library/Android/sdk`;
  const adbPath = `${sdkRoot}/platform-tools/adb`;
  return existsSync(adbPath) ? adbPath : 'adb';
}

export function openIosDevClientUrl(udid = 'booted') {
  execFileSync('xcrun', ['simctl', 'openurl', udid, getDevClientUrl()], { stdio: 'ignore' });
}

export function openAndroidDevClientUrl() {
  const adb = resolveAdbPath();
  execFileSync(adb, ['reverse', 'tcp:8081', 'tcp:8081'], { stdio: 'ignore' });
  execFileSync(
    adb,
    ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', getDevClientUrl(), E2E_APP_ID],
    { stdio: 'ignore' },
  );
}

export function getDevClientBootWaitMs() {
  return Number(process.env.E2E_DEV_CLIENT_BOOT_WAIT_MS ?? 6_000);
}
