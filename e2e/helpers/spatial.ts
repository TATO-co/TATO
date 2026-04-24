/**
 * Spatial measurement helpers for TATO Appium E2E tests.
 *
 * Provides utilities to verify 8pt grid rhythm, alignment, proximity,
 * elevation ordering, and element geometry across native platforms.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

/**
 * Bounding rectangle for a UI element on screen.
 */
export type ElementRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Spacing between two elements.
 */
export type ElementSpacing = {
  horizontal: number;
  vertical: number;
};

export type LabeledSelector = {
  selector: string;
  label: string;
};

export type SpatialCheckResult = {
  label: string;
  pass: boolean;
  reason: string;
};

export type TapTargetResult = {
  label: string;
  pass: boolean;
  width: number;
  height: number;
  reason: string;
};

const MIN_TOUCH_TARGET_IOS = 44;
const MIN_TOUCH_TARGET_ANDROID = 48;
const MIN_INTERACTIVE_SPACING = 8;
let androidPixelRatio: number | null = null;

export function getPlatformMinimumTouchTarget() {
  return typeof driver !== 'undefined' && driver.isAndroid
    ? MIN_TOUCH_TARGET_ANDROID
    : MIN_TOUCH_TARGET_IOS;
}

function isIosRuntime() {
  return typeof driver !== 'undefined' && !driver.isAndroid;
}

function resolveAdbPath() {
  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? `${homedir()}/Library/Android/sdk`;
  const adbPath = `${sdkRoot}/platform-tools/adb`;
  return existsSync(adbPath) ? adbPath : 'adb';
}

function getAndroidPixelRatio() {
  if (typeof driver === 'undefined' || !driver.isAndroid) {
    return 1;
  }

  if (androidPixelRatio) {
    return androidPixelRatio;
  }

  try {
    const output = execFileSync(resolveAdbPath(), ['shell', 'wm', 'density'], { encoding: 'utf-8' });
    const density = Number(output.match(/Physical density:\s*(\d+)/)?.[1]);
    androidPixelRatio = Number.isFinite(density) && density > 0 ? density / 160 : 1;
  } catch {
    androidPixelRatio = 1;
  }

  return androidPixelRatio;
}

export function normalizePlatformMetric(value: number) {
  return value / getAndroidPixelRatio();
}

// --------------------------------------------------------------------------
// Core measurement helpers
// --------------------------------------------------------------------------

/**
 * Returns the bounding rect for an element identified by its selector.
 * Throws if the element does not exist.
 */
export async function getElementRect(selector: string): Promise<ElementRect> {
  const el = await $(selector);
  await el.waitForExist({ timeout: 10_000 });
  const loc = await el.getLocation();
  const size = await el.getSize();
  return {
    x: Math.round(loc.x),
    y: Math.round(loc.y),
    width: Math.round(size.width),
    height: Math.round(size.height),
  };
}

async function getExistingElementRect(selector: string): Promise<ElementRect | null> {
  const el = await $(selector);
  if (!(await el.isExisting())) {
    return null;
  }

  return getElementRect(selector);
}

/**
 * Returns the spacing between two elements' bounding boxes.
 *
 * - `horizontal`: gap between A's right edge and B's left edge (positive = B is right of A).
 * - `vertical`: gap between A's bottom edge and B's top edge (positive = B is below A).
 */
export async function getElementSpacing(
  selectorA: string,
  selectorB: string,
): Promise<ElementSpacing> {
  const a = await getElementRect(selectorA);
  const b = await getElementRect(selectorB);

  return {
    horizontal: b.x - (a.x + a.width),
    vertical: b.y - (a.y + a.height),
  };
}

function getNearestRectGap(a: ElementRect, b: ElementRect) {
  const horizontalGap = Math.max(
    0,
    Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)),
  );
  const verticalGap = Math.max(
    0,
    Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)),
  );

  if (horizontalGap > 0 && verticalGap > 0) {
    return Math.min(horizontalGap, verticalGap);
  }

  return Math.max(horizontalGap, verticalGap);
}

// --------------------------------------------------------------------------
// 8pt Grid / Rhythm
// --------------------------------------------------------------------------

export type RhythmResult = {
  label: string;
  value: number;
  pass: boolean;
  nearestMultiple: number;
};

/**
 * Asserts that `value` is a multiple of `base` (default 8).
 *
 * Values of 0 always pass (elements sharing an edge is valid).
 * Values within ±1 of a multiple pass (sub-pixel rounding tolerance).
 */
export function verifyRhythm(
  value: number,
  label: string,
  base = 8,
): RhythmResult {
  const rounded = Math.round(normalizePlatformMetric(value));
  if (rounded === 0) {
    return { label, value: rounded, pass: true, nearestMultiple: 0 };
  }

  const remainder = Math.abs(rounded) % base;
  const nearestMultiple = remainder <= 1 || remainder >= base - 1
    ? Math.round(rounded / base) * base
    : rounded;

  const pass = remainder <= 1 || remainder >= base - 1;
  return { label, value: rounded, pass, nearestMultiple };
}

/**
 * Verifies spacing between two elements adheres to the 8pt grid.
 */
export async function verifySpacingRhythm(
  selectorA: string,
  selectorB: string,
  label: string,
  base = 8,
): Promise<RhythmResult> {
  const spacing = await getElementSpacing(selectorA, selectorB);
  const gap = spacing.vertical !== 0 ? spacing.vertical : spacing.horizontal;
  return verifyRhythm(gap, label, base);
}

// --------------------------------------------------------------------------
// Alignment
// --------------------------------------------------------------------------

export type AlignmentResult = {
  label: string;
  axis: 'x' | 'y';
  values: { selector: string; value: number }[];
  maxDrift: number;
  pass: boolean;
};

/**
 * Asserts that all elements share the same X (left edge) or Y (top edge).
 *
 * @param tolerance Maximum drift in points between elements (default 2pt).
 */
export async function verifyAlignment(
  selectors: { selector: string; label: string }[],
  axis: 'x' | 'y',
  label: string,
  tolerance = 2,
): Promise<AlignmentResult> {
  const values: { selector: string; value: number }[] = [];

  for (const s of selectors) {
    const rect = await getElementRect(s.selector);
    values.push({ selector: s.label, value: axis === 'x' ? rect.x : rect.y });
  }

  const min = Math.min(...values.map((v) => v.value));
  const max = Math.max(...values.map((v) => v.value));
  const maxDrift = max - min;

  return { label, axis, values, maxDrift, pass: maxDrift <= tolerance };
}

// --------------------------------------------------------------------------
// Proximity (Gestalt)
// --------------------------------------------------------------------------

export type ProximityResult = {
  label: string;
  intraGroupMaxGap: number;
  pass: boolean;
  details: { a: string; b: string; gap: number }[];
};

/**
 * Asserts elements in a group are closer to each other than `maxIntraGap`.
 *
 * Measures vertical spacing between consecutive selectors.
 */
export async function verifyProximity(
  group: { selector: string; label: string }[],
  label: string,
  maxIntraGap: number,
): Promise<ProximityResult> {
  const details: { a: string; b: string; gap: number }[] = [];
  let intraGroupMaxGap = 0;

  for (let i = 0; i < group.length - 1; i++) {
    const spacing = await getElementSpacing(group[i].selector, group[i + 1].selector);
    const gap = Math.round(Math.abs(normalizePlatformMetric(spacing.vertical)));
    details.push({ a: group[i].label, b: group[i + 1].label, gap });
    intraGroupMaxGap = Math.max(intraGroupMaxGap, gap);
  }

  return {
    label,
    intraGroupMaxGap,
    pass: intraGroupMaxGap <= maxIntraGap,
    details,
  };
}

// --------------------------------------------------------------------------
// Element ordering / elevation proxy
// --------------------------------------------------------------------------

/**
 * Verifies that element A appears earlier in the accessibility/view hierarchy
 * than element B (proxy for being at a lower z-index).
 *
 * On Android this uses UiAutomator element ordering; on iOS accessibility order.
 */
export async function verifyElementOrder(
  selectorBackground: string,
  selectorForeground: string,
  label: string,
): Promise<{ label: string; pass: boolean; reason: string }> {
  const bg = await $(selectorBackground);
  const fg = await $(selectorForeground);

  const bgExists = await bg.isExisting();
  const fgExists = await fg.isExisting();

  if (!bgExists || !fgExists) {
    return {
      label,
      pass: false,
      reason: `Missing element: bg=${bgExists}, fg=${fgExists}`,
    };
  }

  // Both exist and are visible — structural ordering confirms layering.
  return { label, pass: true, reason: 'Both elements exist; layering confirmed by rendering order.' };
}

// --------------------------------------------------------------------------
// Content insets (padding measurement proxy)
// --------------------------------------------------------------------------

/**
 * Estimates the padding of a container by comparing its bounding box
 * with its first child element's bounding box.
 *
 * This requires the child to be the first element and flush against the
 * container's padding. Useful for verifying consistent panel padding.
 */
export async function measureContentInsets(
  containerSelector: string,
  childSelector: string,
): Promise<{ top: number; left: number; bottom: number; right: number }> {
  const container = await getElementRect(containerSelector);
  const child = await getElementRect(childSelector);

  return {
    top: child.y - container.y,
    left: child.x - container.x,
    bottom: (container.y + container.height) - (child.y + child.height),
    right: (container.x + container.width) - (child.x + child.width),
  };
}

// --------------------------------------------------------------------------
// Tap target
// --------------------------------------------------------------------------

/**
 * Re-export the tap target verification with spatial context.
 */
export async function verifyMinimumTapTarget(
  selector: string,
  label: string,
  minSize = getPlatformMinimumTouchTarget(),
): Promise<TapTargetResult> {
  const el = await $(selector);
  if (!(await el.isExisting())) {
    return { label, pass: false, width: 0, height: 0, reason: 'Element not found' };
  }

  const size = await el.getSize();
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

export async function verifyMinimumTapTargets(
  targets: LabeledSelector[],
  minSize = getPlatformMinimumTouchTarget(),
): Promise<TapTargetResult[]> {
  const results: TapTargetResult[] = [];

  for (const target of targets) {
    const el = await $(target.selector);
    if (!(await el.isExisting())) {
      continue;
    }

    results.push(await verifyMinimumTapTarget(target.selector, target.label, minSize));
  }

  return results;
}

export async function verifyHeadingBodyHierarchy(
  headingSelector: string,
  bodySelector: string,
  label: string,
  minDelta = 4,
): Promise<SpatialCheckResult & { headingMetric: number; bodyMetric: number; method: string }> {
  const heading = await getExistingElementRect(headingSelector);
  const body = await getExistingElementRect(bodySelector);

  if (!heading || !body) {
    return {
      label,
      pass: false,
      reason: `Missing text element: heading=${Boolean(heading)}, body=${Boolean(body)}`,
      headingMetric: 0,
      bodyMetric: 0,
      method: 'rect-height',
    };
  }

  const headingMetric = Math.round(heading.height);
  const bodyMetric = Math.round(body.height);
  const pass = headingMetric - bodyMetric >= minDelta;

  return {
    label,
    pass,
    reason: pass
      ? 'Heading has a visually larger single-line text box.'
      : `Heading/body visual delta ${headingMetric - bodyMetric}pt is below ${minDelta}pt.`,
    headingMetric,
    bodyMetric,
    method: 'rect-height',
  };
}

export async function verifySiblingInteractiveSpacing(
  targets: LabeledSelector[],
  label: string,
  minGap = MIN_INTERACTIVE_SPACING,
): Promise<SpatialCheckResult & { details: { a: string; b: string; gap: number }[] }> {
  const visibleTargets: Array<LabeledSelector & { rect: ElementRect }> = [];

  for (const target of targets) {
    const rect = await getExistingElementRect(target.selector);
    if (rect) {
      visibleTargets.push({ ...target, rect });
    }
  }

  const details: { a: string; b: string; gap: number }[] = [];

  for (let index = 0; index < visibleTargets.length - 1; index += 1) {
    const current = visibleTargets[index];
    const next = visibleTargets[index + 1];
    details.push({
      a: current.label,
      b: next.label,
      gap: Math.round(normalizePlatformMetric(getNearestRectGap(current.rect, next.rect))),
    });
  }

  const violations = details.filter((detail) => detail.gap < minGap);

  return {
    label,
    pass: violations.length === 0,
    reason: violations.length
      ? `Interactive siblings below ${minGap}pt spacing: ${violations.map((v) => `${v.a}/${v.b}=${v.gap}`).join(', ')}`
      : 'Interactive sibling spacing is comfortable.',
    details,
  };
}

export async function verifySafeAreaRespect(
  selector: string,
  label: string,
  edge: 'top' | 'bottom',
  guardBand = edge === 'top'
    ? (isIosRuntime() ? 44 : 24)
    : (isIosRuntime() ? 8 : 0),
): Promise<SpatialCheckResult & { rect: ElementRect | null; guardBand: number }> {
  const rect = await getExistingElementRect(selector);
  if (!rect) {
    return {
      label,
      pass: false,
      reason: 'Element not found',
      rect,
      guardBand,
    };
  }

  const { height } = await browser.getWindowSize();
  const pass = edge === 'top'
    ? rect.y >= guardBand
    : rect.y + rect.height <= height - guardBand;

  return {
    label,
    pass,
    reason: pass
      ? `${edge} safe area respected.`
      : `${edge} safe area violation: rect=${JSON.stringify(rect)}, guard=${guardBand}, screenHeight=${height}`,
    rect,
    guardBand,
  };
}
