import { ScrollView, Text, View } from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { supplierDesktopNav } from '@/lib/navigation';

export default function AdminUsersScreen() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <ModeShell
        avatarEmoji="🛠️"
        desktopNavActiveKey="profile"
        desktopNavItems={supplierDesktopNav}
        modeLabel="Admin"
        title="Operations Console">
        <View className="mt-4 rounded-[24px] border border-tato-line bg-tato-panel p-5">
          <Text className="text-sm text-tato-muted">Admin access is required to view this screen.</Text>
        </View>
      </ModeShell>
    );
  }

  return (
    <ModeShell
      avatarEmoji="🛠️"
      desktopNavActiveKey="profile"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Admin"
      title="Operations Console">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-4 pb-10">
        <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
            Account Operations
          </Text>
          <Text className="mt-2 text-sm text-tato-muted">
            Persona selection is now self-serve. The legacy manual review queue has been retired from the client.
          </Text>
        </View>

        <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
          <Text className="text-sm text-tato-text">
            Suspension still exists as an account-level control, but the end-user app no longer exposes approval, role grants, or review-queue management.
          </Text>
          <Text className="mt-3 text-sm text-tato-muted">
            If broader admin tooling is needed later, build it as a dedicated account-operations surface instead of reintroducing a manual approval flow.
          </Text>
        </View>
      </ScrollView>
    </ModeShell>
  );
}
