import { useState } from 'react';

import { BrokerFeedPanel } from '@/components/workspace/BrokerFeedPanel';
import type { BrokerDesktopControlEntry } from '@/components/workspace/BrokerDesktopControlsDrawer';
import { ModeShell } from '@/components/layout/ModeShell';
import { useViewportInfo } from '@/lib/constants';
import { brokerDesktopNav } from '@/lib/navigation';

export default function WorkspaceScreen() {
  const { isPhone } = useViewportInfo();
  const [desktopControlsOpen, setDesktopControlsOpen] = useState(false);
  const [desktopControlsEntry, setDesktopControlsEntry] = useState<BrokerDesktopControlEntry>('filters');

  const openDesktopControls = (entry: BrokerDesktopControlEntry) => {
    setDesktopControlsEntry(entry);
    setDesktopControlsOpen(true);
  };

  return (
    <ModeShell
      actions={
        !isPhone
          ? [
            {
              key: 'search',
              icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
              accessibilityLabel: 'Open broker search drawer',
              onPress: () => openDesktopControls('search'),
            },
            {
              key: 'filters',
              icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
              accessibilityLabel: 'Open broker filters drawer',
              onPress: () => openDesktopControls('filters'),
            },
          ]
          : [
            {
              key: 'search',
              href: '/modal',
              icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
              accessibilityLabel: 'Open search and shortcuts',
            },
            {
              key: 'filters',
              href: '/modal',
              icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
              accessibilityLabel: 'Open filters and quick actions',
            },
          ]
      }
      avatarEmoji="🧑"
      desktopNavActiveKey="explore"
      desktopNavItems={brokerDesktopNav}
      modeLabel="Broker Mode"
      title="The Hunt">
      <BrokerFeedPanel
        desktopControlsEntry={desktopControlsEntry}
        desktopControlsOpen={desktopControlsOpen}
        onCloseDesktopControls={() => setDesktopControlsOpen(false)}
        onOpenDesktopControls={openDesktopControls}
      />
    </ModeShell>
  );
}
