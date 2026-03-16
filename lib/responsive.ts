export type ViewportTier = 'phone' | 'tablet' | 'desktop' | 'wideDesktop';
export type NavigationMode = 'tabs' | 'sectionRail' | 'sidebar';

export const TABLET_BREAKPOINT = 768;
export const DESKTOP_BREAKPOINT = 1100;
export const WIDE_DESKTOP_BREAKPOINT = 1440;

export function getViewportTier(width: number): ViewportTier {
  if (width >= WIDE_DESKTOP_BREAKPOINT) {
    return 'wideDesktop';
  }

  if (width >= DESKTOP_BREAKPOINT) {
    return 'desktop';
  }

  if (width >= TABLET_BREAKPOINT) {
    return 'tablet';
  }

  return 'phone';
}

export function getNavigationMode(width: number): NavigationMode {
  const tier = getViewportTier(width);

  if (tier === 'phone') {
    return 'tabs';
  }

  if (tier === 'tablet') {
    return 'sectionRail';
  }

  return 'sidebar';
}

export function getPageMaxWidth(width: number) {
  const tier = getViewportTier(width);

  if (tier === 'wideDesktop') {
    return 1680;
  }

  if (tier === 'desktop') {
    return 1520;
  }

  if (tier === 'tablet') {
    return 1120;
  }

  return undefined;
}

export function getPageGutter(width: number) {
  const tier = getViewportTier(width);

  if (tier === 'wideDesktop') {
    return 40;
  }

  if (tier === 'desktop') {
    return 28;
  }

  if (tier === 'tablet') {
    return 24;
  }

  return 16;
}

export function getViewportColumns(
  width: number,
  columns: {
    phone: number;
    tablet?: number;
    desktop?: number;
    wideDesktop?: number;
  },
) {
  const tier = getViewportTier(width);

  if (tier === 'wideDesktop') {
    return columns.wideDesktop ?? columns.desktop ?? columns.tablet ?? columns.phone;
  }

  if (tier === 'desktop') {
    return columns.desktop ?? columns.tablet ?? columns.phone;
  }

  if (tier === 'tablet') {
    return columns.tablet ?? columns.phone;
  }

  return columns.phone;
}
