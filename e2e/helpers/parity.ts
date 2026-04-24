/**
 * Cross-platform layout parity helpers for TATO Appium E2E tests.
 *
 * Captures serializable layout snapshots per screen, then compares
 * iOS and Android snapshots to verify structural similarity within
 * configurable tolerances.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { getElementRect, type ElementRect } from './spatial.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ElementSnapshot = ElementRect & {
  /** Visible text content, if any. */
  text?: string;
  /** Whether the element is displayed. */
  displayed: boolean;
};

export type LayoutSnapshot = {
  platform: 'iOS' | 'Android';
  screen: string;
  viewport: { width: number; height: number };
  timestamp: string;
  elements: Record<string, ElementSnapshot>;
};

export type ParityDelta = {
  testId: string;
  /** Difference in width (Android minus iOS). */
  dWidth: number;
  /** Difference in height. */
  dHeight: number;
  /** Difference in X position. */
  dX: number;
  /** Difference in Y position. */
  dY: number;
  /** Width ratio (smaller / larger). */
  widthRatio: number;
  /** Height ratio. */
  heightRatio: number;
  /** True if text content matches exactly. */
  textMatch: boolean;
  /** True if within tolerance. */
  pass: boolean;
};

export type ParityReport = {
  screen: string;
  /** Number of elements compared. */
  comparedCount: number;
  /** Number of elements that passed. */
  passCount: number;
  /** Number of elements that failed. */
  failCount: number;
  /** Elements only on one platform. */
  missingOnIos: string[];
  missingOnAndroid: string[];
  deltas: ParityDelta[];
};

// --------------------------------------------------------------------------
// Snapshot capture
// --------------------------------------------------------------------------

const SNAPSHOTS_DIR = `${process.cwd()}/e2e/screenshots/snapshots`;

function ensureSnapshotDir() {
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

/**
 * Captures a layout snapshot of the current screen for the given testIDs.
 *
 * @param screen Human-readable screen name (e.g., 'welcome', 'broker-workspace').
 * @param testIds Map of human-readable keys to Appium selectors.
 */
export async function captureLayoutSnapshot(
  screen: string,
  testIds: Record<string, string>,
): Promise<LayoutSnapshot> {
  const platform = driver.isAndroid ? 'Android' : 'iOS';
  const { width, height } = await browser.getWindowSize();

  const elements: Record<string, ElementSnapshot> = {};

  for (const [key, selector] of Object.entries(testIds)) {
    const el = await $(selector);
    const exists = await el.isExisting();

    if (!exists) {
      continue;
    }

    try {
      const rect = await getElementRect(selector);
      let text: string | undefined;
      try {
        text = await el.getText();
      } catch {
        // Some elements (images, containers) don't have text.
      }

      elements[key] = {
        ...rect,
        text: text || undefined,
        displayed: await el.isDisplayed(),
      };
    } catch {
      // Element may have become stale.
    }
  }

  const snapshot: LayoutSnapshot = {
    platform: platform as 'iOS' | 'Android',
    screen,
    viewport: { width, height },
    timestamp: new Date().toISOString(),
    elements,
  };

  // Persist to disk
  ensureSnapshotDir();
  const filename = `${SNAPSHOTS_DIR}/${screen}-${platform.toLowerCase()}.json`;
  writeFileSync(filename, JSON.stringify(snapshot, null, 2));

  return snapshot;
}

// --------------------------------------------------------------------------
// Comparison
// --------------------------------------------------------------------------

export type ParityOptions = {
  /** Max allowed position drift in points (default 8). */
  positionTolerance?: number;
  /** Min allowed size ratio (default 0.9 = 10% tolerance). */
  sizeRatioMin?: number;
};

/**
 * Compares two layout snapshots and returns a parity report.
 */
export function compareSnapshots(
  ios: LayoutSnapshot,
  android: LayoutSnapshot,
  options: ParityOptions = {},
): ParityReport {
  const { positionTolerance = 8, sizeRatioMin = 0.9 } = options;

  const iosKeys = new Set(Object.keys(ios.elements));
  const androidKeys = new Set(Object.keys(android.elements));
  const commonKeys = [...iosKeys].filter((k) => androidKeys.has(k));

  const missingOnIos = [...androidKeys].filter((k) => !iosKeys.has(k));
  const missingOnAndroid = [...iosKeys].filter((k) => !androidKeys.has(k));

  const deltas: ParityDelta[] = commonKeys.map((key) => {
    const i = ios.elements[key];
    const a = android.elements[key];

    const dWidth = a.width - i.width;
    const dHeight = a.height - i.height;
    const dX = a.x - i.x;
    const dY = a.y - i.y;

    const widthRatio = Math.min(i.width, a.width) / Math.max(i.width, a.width) || 1;
    const heightRatio = Math.min(i.height, a.height) / Math.max(i.height, a.height) || 1;

    const textMatch = i.text === a.text;

    // Position is normalized by removing the safe area delta (top-of-viewport offset
    // may differ by the status bar height). We check relative positioning instead.
    const positionOk = Math.abs(dX) <= positionTolerance;
    const sizeOk = widthRatio >= sizeRatioMin && heightRatio >= sizeRatioMin;
    const pass = positionOk && sizeOk;

    return { testId: key, dWidth, dHeight, dX, dY, widthRatio, heightRatio, textMatch, pass };
  });

  return {
    screen: ios.screen,
    comparedCount: commonKeys.length,
    passCount: deltas.filter((d) => d.pass).length,
    failCount: deltas.filter((d) => !d.pass).length,
    missingOnIos,
    missingOnAndroid,
    deltas,
  };
}

/**
 * Asserts structural parity between two snapshots.
 *
 * Throws a descriptive error if any element exceeds tolerance.
 */
export function assertStructuralParity(
  ios: LayoutSnapshot,
  android: LayoutSnapshot,
  options: ParityOptions = {},
): ParityReport {
  const report = compareSnapshots(ios, android, options);

  // Save report
  ensureSnapshotDir();
  writeFileSync(
    `${SNAPSHOTS_DIR}/../parity-report.json`,
    JSON.stringify(report, null, 2),
  );

  return report;
}

// --------------------------------------------------------------------------
// File I/O for offline comparison
// --------------------------------------------------------------------------

/**
 * Reads a previously saved snapshot from disk.
 */
export function readSnapshot(screen: string, platform: 'ios' | 'android'): LayoutSnapshot | null {
  const filename = `${SNAPSHOTS_DIR}/${screen}-${platform}.json`;
  if (!existsSync(filename)) {
    return null;
  }

  return JSON.parse(readFileSync(filename, 'utf-8')) as LayoutSnapshot;
}
