import { describe, expect, it } from 'vitest';

import {
  getNavigationMode,
  getPageGutter,
  getPageMaxWidth,
  getViewportColumns,
  getViewportTier,
} from '@/lib/responsive';
import { GRID } from '@/lib/token-values';

describe('responsive contract', () => {
  it('resolves viewport tiers at the expected boundaries', () => {
    expect(getViewportTier(390)).toBe('phone');
    expect(getViewportTier(430)).toBe('phone');
    expect(getViewportTier(768)).toBe('tablet');
    expect(getViewportTier(820)).toBe('tablet');
    expect(getViewportTier(1024)).toBe('tablet');
    expect(getViewportTier(1280)).toBe('desktop');
    expect(getViewportTier(1440)).toBe('wideDesktop');
  });

  it('maps each tier to the intended navigation pattern', () => {
    expect(getNavigationMode(390)).toBe('tabs');
    expect(getNavigationMode(820)).toBe('sectionRail');
    expect(getNavigationMode(1280)).toBe('sidebar');
    expect(getNavigationMode(1440)).toBe('sidebar');
  });

  it('returns stable page gutters and max widths by tier', () => {
    expect(getPageGutter(390)).toBe(GRID.phone.margin);
    expect(getPageGutter(820)).toBe(GRID.tablet.margin);
    expect(getPageGutter(1280)).toBe(GRID.desktop.margin);
    expect(getPageGutter(1440)).toBe(GRID.wideDesktop.margin);

    expect(getPageMaxWidth(390)).toBeUndefined();
    expect(getPageMaxWidth(820)).toBe(1120);
    expect(getPageMaxWidth(1280)).toBe(1520);
    expect(getPageMaxWidth(1440)).toBe(1680);
  });

  it('falls back to the nearest defined column count for each tier', () => {
    const columns = { phone: 1, tablet: 2, desktop: 3, wideDesktop: 4 };

    expect(getViewportColumns(390, columns)).toBe(1);
    expect(getViewportColumns(820, columns)).toBe(2);
    expect(getViewportColumns(1280, columns)).toBe(3);
    expect(getViewportColumns(1440, columns)).toBe(4);

    expect(getViewportColumns(1280, { phone: 1, tablet: 2 })).toBe(2);
    expect(getViewportColumns(1440, { phone: 1, desktop: 3 })).toBe(3);
  });
});
