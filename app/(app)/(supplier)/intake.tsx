import { useRouter } from 'expo-router';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDockContentPadding } from '@/components/layout/PhoneTabBar';
import { ModeShell } from '@/components/layout/ModeShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { ResponsiveKpiGrid } from '@/components/layout/ResponsivePrimitives';
import { PhoneActionButton, PhoneEyebrow, PhonePanel } from '@/components/ui/PhoneChrome';
import { PressableScale } from '@/components/ui/PressableScale';
import { trackEvent } from '@/lib/analytics';
import { useViewportInfo } from '@/lib/constants';
import { getLiveIntakeEntryState } from '@/lib/liveIntake/platform';
import type { LiveIntakeAvailability } from '@/lib/liveIntake/types';
import { getLiveIntakeAvailability, isLiveIntakeConfigured } from '@/lib/repositories/liveIntake';
import { supplierDesktopNav } from '@/lib/navigation';
import { getStillPhotoRoute, normalizeStillPhotoFallbackMessage } from '@/lib/stillPhotoIntake';

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
      'Show items on camera while TATO identifies, grades, and prices them.',
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
      'Snap a photo and run AI analysis.',
    actionLabel: 'Open Camera Capture',
    route: '/(app)/ingestion?entry=camera',
    accentClassName: 'border-[#21406d] bg-tato-panel',
    icon: { ios: 'camera', android: 'photo-camera', web: 'photo-camera' },
    bullets: ['Direct camera capture', 'Same catalog schema', 'Best for single-item intake'],
  },
  {
    id: 'upload',
    title: 'Upload Photos',
    eyebrow: 'Standard Fallback',
    description:
      'Upload existing photos for AI analysis.',
    actionLabel: 'Open Photo Upload',
    route: '/(app)/ingestion?entry=upload',
    accentClassName: 'border-[#21406d] bg-tato-panel',
    icon: { ios: 'photo.on.rectangle', android: 'photo-library', web: 'photo-library' },
    bullets: ['Use existing gallery photos', 'Low-bandwidth fallback', 'Useful for remote or batched review'],
  },
];

export default function SupplierIntakeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isPhone, tier } = useViewportInfo();
  const isWeb = Platform.OS === 'web';
  const liveConfigured = isLiveIntakeConfigured();
  const [liveAvailability, setLiveAvailability] = useState<LiveIntakeAvailability | null>(null);
  const [liveAvailabilityLoading, setLiveAvailabilityLoading] = useState(true);
  const liveWorkflow = workflows.find((workflow) => workflow.id === 'live')!;
  const cameraWorkflow = workflows.find((workflow) => workflow.id === 'camera')!;
  const uploadWorkflow = workflows.find((workflow) => workflow.id === 'upload')!;
  const stillPhotoWorkflow = isWeb ? uploadWorkflow : cameraWorkflow;
  const photoWorkflows = isWeb ? [uploadWorkflow] : [cameraWorkflow, uploadWorkflow];
  const visibleWorkflows = isWeb ? [liveWorkflow, uploadWorkflow] : workflows;
  const liveEntryState = getLiveIntakeEntryState({
    liveConfigured,
    availability: liveAvailability,
    checking: liveAvailabilityLoading,
  });
  const liveEntryMessage = normalizeStillPhotoFallbackMessage(liveEntryState.message, Platform.OS);
  const liveReady = liveEntryState.enabled;
  const liveMissingHub = liveAvailability?.code === 'missing_hub';
  const phoneScrollPaddingBottom = getDockContentPadding(insets.bottom);

  useEffect(() => {
    let cancelled = false;

    const loadAvailability = async () => {
      setLiveAvailabilityLoading(true);
      const availability = await getLiveIntakeAvailability({ supplierId: user?.id ?? null });
      if (!cancelled) {
        setLiveAvailability(availability);
        setLiveAvailabilityLoading(false);
      }
    };

    void loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    trackEvent('open_intake_hub', {
      live_configured: liveConfigured,
      live_available: liveReady,
      live_status: liveEntryState.status,
    });
  }, [liveConfigured, liveEntryState.status, liveReady]);

  const openWorkflow = (workflow: IntakeWorkflow) => {
    const route = workflow.id === 'live' ? liveEntryState.route : workflow.route;
    trackEvent('open_intake_hub', {
      workflow: workflow.id,
      live_configured: workflow.id === 'live' ? liveConfigured : undefined,
      live_available: workflow.id === 'live' ? liveReady : undefined,
      live_status: workflow.id === 'live' ? liveEntryState.status : undefined,
    });
    router.push(route as never);
  };

  return (
    <ModeShell
      actions={
        isPhone
          ? []
          : isWeb
            ? [
                {
                  key: 'upload',
                  href: getStillPhotoRoute({ platform: Platform.OS, preferred: 'upload' }),
                  icon: { ios: 'photo.on.rectangle', android: 'photo-library', web: 'photo-library' },
                  accessibilityLabel: 'Open photo upload',
                },
              ]
            : [
                {
                  key: 'camera',
                  href: getStillPhotoRoute({ platform: Platform.OS, preferred: 'camera' }),
                  icon: { ios: 'camera', android: 'photo-camera', web: 'photo-camera' },
                  accessibilityLabel: 'Open camera capture',
                },
                {
                  key: 'upload',
                  href: getStillPhotoRoute({ platform: Platform.OS, preferred: 'upload' }),
                  icon: { ios: 'photo.on.rectangle', android: 'photo-library', web: 'photo-library' },
                  accessibilityLabel: 'Open photo upload',
                },
              ]
      }
      avatarEmoji="👔"
      desktopNavActiveKey="intake"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      {isPhone ? (
        <ScrollView
          className="mt-2 flex-1"
          contentContainerClassName="gap-4"
          contentContainerStyle={{ paddingBottom: phoneScrollPaddingBottom }}>
          <PhonePanel gradientTone="accent" padded="lg">
            <PhoneEyebrow tone="accent">Supplier Intake</PhoneEyebrow>
            <Text className="mt-3 text-[30px] font-sans-bold leading-[34px] text-tato-text">
              {liveReady
                ? 'Talk through the item. Gemini handles the intake form in the background.'
                : liveEntryState.status === 'checking'
                  ? isWeb
                    ? 'Live posting is being checked. Photo upload is ready right now.'
                    : 'Live posting is being checked. Camera capture is ready right now.'
                  : liveEntryMessage}
            </Text>

            <View className="mt-6 flex-row gap-3">
              <PhoneActionButton
                containerClassName="flex-1"
                label={
                  liveReady
                    ? 'Start Live Intake'
                    : liveMissingHub
                      ? 'Set Up Supplier Hub'
                      : isWeb
                        ? 'Open Photo Upload'
                        : 'Open Camera Capture'
                }
                onPress={() => {
                  if (liveReady) {
                    openWorkflow(liveWorkflow);
                    return;
                  }

                  if (liveMissingHub) {
                    router.push('/(app)/(supplier)/profile' as never);
                    return;
                  }

                  openWorkflow(stillPhotoWorkflow);
                }}
              />
              <PhoneActionButton
                containerClassName="flex-1"
                label={isWeb ? 'Photo Upload' : liveReady ? 'Photo Capture' : 'Open Camera Capture'}
                onPress={() => openWorkflow(stillPhotoWorkflow)}
                variant="secondary"
              />
            </View>
          </PhonePanel>

          <PhonePanel padded="lg">
            <PhoneEyebrow>Other Options</PhoneEyebrow>
            <Text className="mt-3 text-[22px] font-sans-bold leading-[28px] text-tato-text">
              {isWeb ? 'Photo Upload' : 'Photo Capture'}
            </Text>

            <View className="mt-4 gap-3">
              {photoWorkflows.map((workflow) => (
                <PressableScale
                  activeScale={0.985}
                  className="rounded-[22px] border border-[#17355f] bg-[#091a31] p-4"
                  key={workflow.id}
                  onPress={() => openWorkflow(workflow)}>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <PhoneEyebrow>{workflow.eyebrow}</PhoneEyebrow>
                      <Text className="mt-2 text-[18px] font-sans-bold leading-6 text-tato-text">
                        {workflow.title}
                      </Text>
                      <Text className="mt-2 text-sm leading-7 text-tato-muted">
                        {workflow.description}
                      </Text>
                    </View>
                    <PlatformIcon name={workflow.icon} size={20} color="#edf4ff" />
                  </View>
                  <Text className="mt-3 font-mono text-[11px] uppercase tracking-[1px] text-[#9cb7e1]">
                    {workflow.actionLabel}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </PhonePanel>
        </ScrollView>
      ) : (
        <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
          <View className="rounded-[28px] border border-tato-line bg-[#0b1b33] p-6">
            <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
              Supplier Intake
            </Text>
            <Text className="mt-3 text-3xl font-bold text-tato-text">Choose how to add items.</Text>
            <Text className="mt-3 max-w-[760px] text-sm leading-7 text-tato-muted">
              {liveReady
                ? 'Use live intake when you want Gemini to build the broker-ready draft while you talk through the item.'
                : liveEntryMessage}
            </Text>

            <View className="mt-5 flex-row flex-wrap gap-3">
              <View className={`rounded-full border px-3 py-1.5 ${liveReady ? 'border-tato-profit/40 bg-tato-profit/10' : 'border-[#f5b942]/40 bg-[#f5b942]/10'}`}>
                <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${liveReady ? 'text-tato-profit' : 'text-[#f5b942]'}`}>
                  {liveReady
                    ? 'Live Posting Ready'
                    : liveEntryState.status === 'checking'
                      ? 'Checking Live Posting'
                      : 'Live Intake Unavailable'}
                </Text>
              </View>
              <View className="rounded-full border border-[#21406d] bg-[#102443] px-3 py-1.5">
                <Text className="font-mono text-[11px] uppercase tracking-[1px] text-[#9cb7e1]">
                  Photo fallback available
                </Text>
              </View>
            </View>
          </View>

          <ResponsiveKpiGrid tier={tier} columns={{ phone: 1, tablet: 2, desktop: 3, wideDesktop: 3 }}>
            {visibleWorkflows.map((workflow) => {
              const isLiveWorkflow = workflow.id === 'live';
              const actionLabel = isLiveWorkflow
                ? liveReady
                  ? workflow.actionLabel
                  : liveMissingHub
                    ? 'Set Up Supplier Hub'
                    : isWeb
                      ? 'Open Photo Upload'
                      : 'Open Camera Capture'
                : workflow.actionLabel;
              const description = isLiveWorkflow && !liveReady
                ? liveEntryMessage
                : workflow.description;

              return (
                <PressableScale
                  activeScale={0.985}
                  className={`rounded-[26px] border p-5 ${workflow.accentClassName}`}
                  key={workflow.id}
                  onPress={() => {
                    if (!isLiveWorkflow) {
                      openWorkflow(workflow);
                      return;
                    }

                    if (liveReady) {
                      openWorkflow(workflow);
                      return;
                    }

                    if (liveMissingHub) {
                      router.push('/(app)/(supplier)/profile' as never);
                      return;
                    }

                    openWorkflow(stillPhotoWorkflow);
                  }}>
                  <View className="flex-row items-center justify-between gap-4">
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-black/25">
                      <PlatformIcon name={workflow.icon} size={20} color="#edf4ff" />
                    </View>
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
                      {workflow.eyebrow}
                    </Text>
                  </View>

                  <Text className="mt-5 text-2xl font-bold text-tato-text">{workflow.title}</Text>
                  <Text className="mt-3 text-sm leading-7 text-tato-muted">{description}</Text>

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
                      {actionLabel}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </ResponsiveKpiGrid>
        </ScrollView>
      )}
    </ModeShell>
  );
}
