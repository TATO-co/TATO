import { ModeShell } from '@/components/layout/ModeShell';
import { SupplierQueuePanel } from '@/components/workspace/SupplierQueuePanel';
import { supplierDesktopNav } from '@/lib/navigation';

export default function SupplierDashboardScreen() {
  return (
    <ModeShell
      actions={[
        {
          key: 'intake',
          href: '/(app)/(supplier)/intake',
          icon: { ios: 'waveform.and.mic', android: 'mic', web: 'mic' },
          accessibilityLabel: 'Open supplier intake hub',
        },
        {
          key: 'inventory',
          href: '/(app)/(supplier)/inventory',
          icon: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
          accessibilityLabel: 'Open supplier inventory',
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="dashboard"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      <SupplierQueuePanel />
    </ModeShell>
  );
}
