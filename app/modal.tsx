import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, Text, View } from 'react-native';

const actions = [
  'Launch AI Auto-Scan',
  'Open buyer QR checkout',
  'Regenerate broker listing copy',
  'Review expiring claims',
];

export default function ModalScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 justify-end bg-black/60">
      <View className="rounded-t-[28px] border border-tato-line bg-tato-panel p-5">
        <Text className="text-sm uppercase tracking-[2px] text-tato-muted" style={{ fontFamily: 'SpaceMono' }}>
          Quick Actions
        </Text>
        <Text className="mt-1 text-3xl font-bold text-tato-text">TATO Workflow Shortcuts</Text>

        <View className="mt-4 gap-2">
          {actions.map((action) => (
            <View className="rounded-2xl border border-tato-line bg-tato-panelSoft p-4" key={action}>
              <Text className="text-sm text-tato-text">{action}</Text>
            </View>
          ))}
        </View>

        <Pressable
          className="mt-5 rounded-full bg-tato-accent py-4 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
          onPress={() => router.back()}>
          <Text className="text-center text-sm font-semibold uppercase tracking-[1px] text-white" style={{ fontFamily: 'SpaceMono' }}>
            Close
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
