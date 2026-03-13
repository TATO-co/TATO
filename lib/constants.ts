import { useWindowDimensions } from 'react-native';

export type ViewportTier = 'mobile' | 'tablet' | 'desktop' | 'wideDesktop';

/**
 * Breakpoint at which the UI switches from mobile (tab bar)
 * to desktop (sidebar / pill-bar) navigation.
 */
export const DESKTOP_BREAKPOINT = 1100;
export const TABLET_BREAKPOINT = 768;
export const WIDE_DESKTOP_BREAKPOINT = 1440;

export function useViewportInfo() {
    const { width } = useWindowDimensions();
    const isDesktop = width >= DESKTOP_BREAKPOINT;
    const isWideDesktop = width >= WIDE_DESKTOP_BREAKPOINT;
    const isTablet = width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT;

    let tier: ViewportTier = 'mobile';
    if (isWideDesktop) {
        tier = 'wideDesktop';
    } else if (isDesktop) {
        tier = 'desktop';
    } else if (isTablet) {
        tier = 'tablet';
    }

    return {
        width,
        tier,
        isTablet,
        isDesktop,
        isWideDesktop,
        isCompactDesktop: isDesktop && !isWideDesktop,
    };
}

/**
 * Convenience hook that returns `true` when the viewport is at or
 * beyond the desktop breakpoint — avoids repeating the raw number
 * across dozens of components.
 */
export function useIsDesktop() {
    return useViewportInfo().isDesktop;
}
