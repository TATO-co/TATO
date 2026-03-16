import { useWindowDimensions } from 'react-native';

import {
  DESKTOP_BREAKPOINT,
  getNavigationMode,
  getPageGutter,
  getPageMaxWidth,
  getViewportColumns,
  getViewportTier,
  NavigationMode,
  TABLET_BREAKPOINT,
  ViewportTier,
  WIDE_DESKTOP_BREAKPOINT,
} from '@/lib/responsive';

export {
  DESKTOP_BREAKPOINT,
  getNavigationMode,
  getPageGutter,
  getPageMaxWidth,
  getViewportColumns,
  getViewportTier,
  NavigationMode,
  TABLET_BREAKPOINT,
  ViewportTier,
  WIDE_DESKTOP_BREAKPOINT,
};

export function useViewportInfo() {
  const { width, height } = useWindowDimensions();
  const tier = getViewportTier(width);
  const navigationMode = getNavigationMode(width);
  const isPhone = tier === 'phone';
  const isTablet = tier === 'tablet';
  const isDesktop = tier === 'desktop' || tier === 'wideDesktop';
  const isWideDesktop = tier === 'wideDesktop';

  return {
    width,
    height,
    tier,
    navigationMode,
    isPhone,
    isTablet,
    isDesktop,
    isWideDesktop,
    isCompactDesktop: tier === 'desktop',
    pageMaxWidth: getPageMaxWidth(width),
    pageGutter: getPageGutter(width),
  };
}

export function useIsPhone() {
  return useViewportInfo().isPhone;
}

export function useIsTablet() {
  return useViewportInfo().isTablet;
}

export function useIsDesktop() {
  return useViewportInfo().isDesktop;
}
