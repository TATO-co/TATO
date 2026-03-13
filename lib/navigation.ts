import type { DesktopSectionNavItem } from '@/components/ui/DesktopSectionNav';

export const brokerDesktopNav: DesktopSectionNavItem[] = [
  { key: 'explore', label: 'Explore', href: '/(app)/(broker)/workspace' },
  { key: 'claims', label: 'My Claims', href: '/(app)/(broker)/claims' },
  { key: 'wallet', label: 'Wallet', href: '/(app)/(broker)/wallet' },
  { key: 'profile', label: 'Profile', href: '/(app)/(broker)/profile' },
];

export const supplierDesktopNav: DesktopSectionNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/(app)/(supplier)/dashboard' },
  { key: 'intake', label: 'Intake', href: '/(app)/(supplier)/intake' },
  { key: 'inventory', label: 'Inventory', href: '/(app)/(supplier)/inventory' },
  { key: 'analytics', label: 'Analytics', href: '/(app)/(supplier)/analytics' },
  { key: 'profile', label: 'Profile', href: '/(app)/(supplier)/profile' },
];
