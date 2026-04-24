/**
 * Offline cross-platform parity comparison script.
 *
 * Reads iOS and Android layout snapshots from e2e/screenshots/snapshots/
 * and compares them for structural similarity.
 *
 * Usage: npx tsx e2e/helpers/compare-parity.ts
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';

type ElementSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  displayed: boolean;
};

type LayoutSnapshot = {
  platform: 'iOS' | 'Android';
  screen: string;
  viewport: { width: number; height: number };
  timestamp: string;
  elements: Record<string, ElementSnapshot>;
};

type ParityDelta = {
  testId: string;
  dWidth: number;
  dHeight: number;
  dX: number;
  dY: number;
  widthRatio: number;
  heightRatio: number;
  textMatch: boolean;
  pass: boolean;
};

type ParityReport = {
  screen: string;
  comparedCount: number;
  passCount: number;
  failCount: number;
  missingOnIos: string[];
  missingOnAndroid: string[];
  deltas: ParityDelta[];
};

const SNAPSHOTS_DIR = `${process.cwd()}/e2e/screenshots/snapshots`;
const REPORT_PATH = `${process.cwd()}/e2e/screenshots/parity-report.json`;

function compare(ios: LayoutSnapshot, android: LayoutSnapshot): ParityReport {
  const positionTolerance = 8;
  const sizeRatioMin = 0.9;

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

function main() {
  if (!existsSync(SNAPSHOTS_DIR)) {
    console.error(`\n  ❌ No snapshots directory found at ${SNAPSHOTS_DIR}`);
    console.error('     Run both iOS and Android E2E suites first to generate snapshots.\n');
    process.exit(1);
  }

  const files = readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json'));
  const screens = new Set(files.map((f) => f.replace(/-(?:ios|android)\.json$/, '')));

  if (!screens.size) {
    console.error('  ❌ No snapshot files found.\n');
    process.exit(1);
  }

  const allReports: ParityReport[] = [];
  let totalFails = 0;

  for (const screen of screens) {
    const iosFile = `${SNAPSHOTS_DIR}/${screen}-ios.json`;
    const androidFile = `${SNAPSHOTS_DIR}/${screen}-android.json`;

    if (!existsSync(iosFile)) {
      console.warn(`  ⚠️  Missing iOS snapshot for screen: ${screen}`);
      continue;
    }

    if (!existsSync(androidFile)) {
      console.warn(`  ⚠️  Missing Android snapshot for screen: ${screen}`);
      continue;
    }

    const ios = JSON.parse(readFileSync(iosFile, 'utf-8')) as LayoutSnapshot;
    const android = JSON.parse(readFileSync(androidFile, 'utf-8')) as LayoutSnapshot;
    const report = compare(ios, android);

    allReports.push(report);
    totalFails += report.failCount;

    // Print results
    console.log(`\n  📐 ${screen}`);
    console.log(`     Compared: ${report.comparedCount} elements`);
    console.log(`     ✅ Pass: ${report.passCount}  ❌ Fail: ${report.failCount}`);

    if (report.missingOnIos.length) {
      console.log(`     ⚠️  Missing on iOS: ${report.missingOnIos.join(', ')}`);
    }

    if (report.missingOnAndroid.length) {
      console.log(`     ⚠️  Missing on Android: ${report.missingOnAndroid.join(', ')}`);
    }

    for (const delta of report.deltas.filter((d) => !d.pass)) {
      console.log(
        `     ❌ ${delta.testId}: ΔX=${delta.dX}pt ΔW=${delta.dWidth}pt wRatio=${delta.widthRatio.toFixed(2)} hRatio=${delta.heightRatio.toFixed(2)}`,
      );
    }
  }

  // Persist report
  if (!existsSync(`${process.cwd()}/e2e/screenshots`)) {
    mkdirSync(`${process.cwd()}/e2e/screenshots`, { recursive: true });
  }
  writeFileSync(REPORT_PATH, JSON.stringify(allReports, null, 2));
  console.log(`\n  📄 Full report saved to ${REPORT_PATH}\n`);

  if (totalFails > 0) {
    console.error(`  ❌ ${totalFails} element(s) exceeded parity tolerance.\n`);
    process.exit(1);
  }

  console.log('  ✅ All elements within parity tolerance.\n');
}

main();
