import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { PressableScale } from '@/components/ui/PressableScale';
import { trackEvent } from '@/lib/analytics';
import { isLiveIntakeConfigured } from '@/lib/repositories/liveIntake';
import { supplierDesktopNav } from '@/lib/navigation';

type IntakeWorkflow = {
  id: 'live' | 'camera' | 'upload';
  title: string;
  eyebrow: string;
  description: string;
  actionLabel: string;
  route: string;
  accentClassName: string;
  icon: { ios: string; android: string; web: string };
  bullets: string[];
};

const workflows: IntakeWorkflow[] = [
  {
    id: 'live',
    title: 'Start Intake',
    eyebrow: 'Gemini Live Agent',
    description:
      'Prop up the phone and talk through each item while Gemini asks follow-up questions, spots condition cues, and proposes floor prices in real time.',
    actionLabel: 'Launch Live Intake',
    route: '/(app)/live-intake',
    accentClassName: 'border-tato-accent/35 bg-[#102443]',
    icon: { ios: 'waveform.and.mic', android: 'mic', web: 'mic' },
    bullets: ['Voice + vision session', 'Interruptible back-and-forth', 'Best for sorting tables and box pulls'],
  },
  {
    id: 'camera',
    title: 'Take Photos',
    eyebrow: 'Guided Capture',
    description:
      'Use the camera when the live session is overkill or the room is too noisy. Capture one item, run analysis, and confirm the catalog entry.',
    actionLabel: 'Open Camera Capture',
    route: '/(app)/ingestion?entry=camera',
    accentClassName: 'border-[#21406d] bg-tato-panel',
    icon: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
    bullets: ['Direct camera capture', 'Same catalog schema', 'Best for single-item intake'],
  },
  {
    id: 'upload',
    title: 'Upload Photos',
    eyebrow: 'Standard Fallback',
    description:
      'Upload existing photos from the device when the item has already been shot or when you need a quieter, more deliberate review flow.',
    actionLabel: 'Open Photo Upload',
    route: '/(app)/ingestion?entry=upload',
    accentClassName: 'border-[#21406d] bg-tato-panel',
    icon: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
    bullets: ['Use existing gallery photos', 'Low-bandwidth fallback', 'Useful for remote or batched review'],
  },
];

export default function SupplierIntakeScreen() {
  const router = useRouter();
  const liveConfigured = isLiveIntakeConfigured();

  useEffect(() => {
    trackEvent('open_intake_hub', { live_configured: liveConfigured });
  }, [liveConfigured]);

  const openWorkflow = (workflow: IntakeWorkflow) => {
    trackEvent('open_intake_hub', {
      workflow: workflow.id,
      live_configured: workflow.id === 'live' ? liveConfigured : undefined,
    });
    router.push(workflow.route as never);
  };

  return (
    <ModeShell
      actions={[
        {
          key: 'live',
          href: '/(app)/live-intake',
          icon: { ios: 'waveform.and.mic', android: 'mic', web: 'mic' },
          accessibilityLabel: 'Open hands-free live intake',
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="intake"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
        <View className="rounded-[28px] border border-tato-line bg-[#0b1b33] p-6">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
            Supplier Intake
          </Text>
          <Text className="mt-3 text-3xl font-bold text-tato-text">Choose how this batch enters TATO.</Text>
          <Text className="mt-3 max-w-[920px] text-sm leading-7 text-tato-muted">
            Live intake is the flagship path: the agent listens, watches the item, asks follow-up questions, and logs price guidance without forcing the supplier through form fields. Standard camera and upload paths remain available when speed, noise, or connectivity make live intake the wrong call.
          </Text>

          <View className="mt-5 flex-row flex-wrap gap-3">
            <View className={`rounded-full border px-3 py-1.5 ${liveConfigured ? 'border-tato-profit/40 bg-tato-profit/10' : 'border-[#f5b942]/40 bg-[#f5b942]/10'}`}>
              <Text className={`font-mono text-[10px] uppercase tracking-[1px] ${liveConfigured ? 'text-tato-profit' : 'text-[#f5b942]'}`}>
                {liveConfigured ? 'Google Cloud Live Ready' : 'Live Service Not Configured'}
              </Text>
            </View>
            <View className="rounded-full border border-[#21406d] bg-[#102443] px-3 py-1.5">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-[#9cb7e1]">
                Keep Photo Upload As Fallback
              </Text>
            </View>
          </View>
        </View>

        <View className="gap-4 xl:flex-row">
          {workflows.map((workflow) => (
            <PressableScale
              activeScale={0.985}
              className={`flex-1 rounded-[26px] border p-5 ${workflow.accentClassName}`}
              key={workflow.id}
              onPress={() => openWorkflow(workflow)}>
              <View className="flex-row items-center justify-between gap-4">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-black/25">
                  <SymbolView name={workflow.icon as never} size={20} tintColor="#edf4ff" />
                </View>
                <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                  {workflow.eyebrow}
                </Text>
              </View>

              <Text className="mt-5 text-2xl font-bold text-tato-text">{workflow.title}</Text>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">{workflow.description}</Text>

              <View className="mt-5 gap-2.5">
                {workflow.bullets.map((bullet) => (
                  <View className="flex-row items-center gap-2" key={bullet}>
                    <View className="h-2 w-2 rounded-full bg-tato-accent" />
                    <Text className="text-sm text-tato-text">{bullet}</Text>
                  </View>
                ))}
              </View>

              <View className="mt-6 rounded-full bg-tato-accent px-4 py-3">
                <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                  {workflow.actionLabel}
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>
      </ScrollView>
    </ModeShell>
  );
}
