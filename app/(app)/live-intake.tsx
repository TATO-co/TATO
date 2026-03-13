import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { ModeShell } from '@/components/layout/ModeShell';
import { PressableScale } from '@/components/ui/PressableScale';
import { trackEvent } from '@/lib/analytics';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  requestLiveIntakeBootstrap,
  type LiveIntakeBootstrap,
} from '@/lib/repositories/liveIntake';
import { supplierDesktopNav } from '@/lib/navigation';

const transcriptPreview = [
  { speaker: 'Agent', body: 'Alright, what do we have first?', tone: 'accent' as const },
  { speaker: 'Supplier', body: "Got a pair of Jordan 4s here.", tone: 'neutral' as const },
  { speaker: 'Agent', body: "I see them. Looks like the Military Black colorway. Show me the soles so I can check the wear.", tone: 'accent' as const },
  { speaker: 'Supplier', body: 'Here you go.', tone: 'neutral' as const },
  { speaker: 'Agent', body: "Soles look clean. I'd log Excellent condition with a floor near $280. Want to move faster and trim that?", tone: 'accent' as const },
  { speaker: 'Supplier', body: 'Make the floor $250 so they move quicker.', tone: 'neutral' as const },
];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4 rounded-[18px] border border-tato-line bg-tato-panelSoft px-4 py-3">
      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">{label}</Text>
      <Text className="text-right text-sm font-semibold text-tato-text">{value}</Text>
    </View>
  );
}

function PermissionChip({
  label,
  granted,
}: {
  label: string;
  granted: boolean;
}) {
  return (
    <View className={`rounded-full border px-3 py-1.5 ${granted ? 'border-tato-profit/40 bg-tato-profit/10' : 'border-[#f5b942]/40 bg-[#f5b942]/10'}`}>
      <Text className={`font-mono text-[10px] uppercase tracking-[1px] ${granted ? 'text-tato-profit' : 'text-[#f5b942]'}`}>
        {label}: {granted ? 'Ready' : 'Needed'}
      </Text>
    </View>
  );
}

export default function LiveIntakeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [bootstrap, setBootstrap] = useState<LiveIntakeBootstrap | null>(null);
  const [status, setStatus] = useState<'idle' | 'permissions' | 'requesting' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const cameraGranted = Boolean(cameraPermission?.granted);
  const microphoneGranted = Boolean(microphonePermission?.granted);
  const canRequestSession = cameraGranted && microphoneGranted && Boolean(user?.id);

  const sessionStatusLabel = useMemo(() => {
    if (status === 'ready' && bootstrap) {
      return 'Bootstrap ready';
    }
    if (status === 'requesting') {
      return 'Requesting';
    }
    if (status === 'error') {
      return 'Action needed';
    }
    return 'Preflight';
  }, [bootstrap, status]);

  const requestPermissions = async () => {
    setStatus('permissions');
    setError(null);

    const [cameraResult, microphoneResult] = await Promise.all([
      requestCameraPermission(),
      requestMicrophonePermission(),
    ]);

    if (!cameraResult.granted || !microphoneResult.granted) {
      setStatus('error');
      setError('Camera and microphone permissions are required for the hands-free intake flow.');
      return;
    }

    setStatus('idle');
  };

  const startSession = async () => {
    if (!user?.id) {
      setStatus('error');
      setError('Sign in with an approved supplier account before starting live intake.');
      return;
    }

    if (!cameraGranted || !microphoneGranted) {
      setStatus('error');
      setError('Enable camera and microphone access before starting the live agent.');
      return;
    }

    setStatus('requesting');
    setError(null);
    trackEvent('live_intake_session_requested', { supplier_id: user.id });

    const result = await requestLiveIntakeBootstrap({ supplierId: user.id });
    if (!result.ok) {
      setBootstrap(null);
      setStatus('error');
      setError(result.message);
      trackEvent('live_intake_session_error', { supplier_id: user.id, message: result.message });
      return;
    }

    setBootstrap(result.bootstrap);
    setStatus('ready');
    trackEvent('live_intake_session_ready', {
      supplier_id: user.id,
      model: result.bootstrap.model,
      region: result.bootstrap.googleCloudRegion ?? 'unknown',
    });
  };

  return (
    <ModeShell
      actions={[
        {
          key: 'fallback-camera',
          href: '/(app)/ingestion?entry=camera',
          icon: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
          accessibilityLabel: 'Switch to photo capture intake',
        },
        {
          key: 'fallback-upload',
          href: '/(app)/ingestion?entry=upload',
          icon: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
          accessibilityLabel: 'Switch to photo upload intake',
        },
      ]}
      avatarEmoji="👔"
      desktopNavActiveKey="intake"
      desktopNavItems={supplierDesktopNav}
      modeLabel="Supplier Mode"
      title="TATO Supplier">
      <ScrollView className="mt-2 flex-1" contentContainerClassName="gap-5 pb-10">
        <View className="rounded-[28px] border border-tato-line bg-[#0b1b33] p-6">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
                Hands-Free Intake Appraiser
              </Text>
              <Text className="mt-3 text-3xl font-bold text-tato-text">Talk through a batch instead of filling a form.</Text>
              <Text className="mt-3 max-w-[920px] text-sm leading-7 text-tato-muted">
                This flow is built for Gemini Live on Google Cloud. The supplier props up the phone, pulls items from a box, and answers follow-up questions while the agent watches, asks for better angles, and proposes pricing and condition data in real time.
              </Text>
            </View>

            <Pressable
              accessibilityLabel="Back to intake options"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full bg-tato-panelSoft"
              onPress={() => router.back()}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#edf4ff" />
            </Pressable>
          </View>

          <View className="mt-5 flex-row flex-wrap gap-3">
            <PermissionChip granted={cameraGranted} label="Camera" />
            <PermissionChip granted={microphoneGranted} label="Microphone" />
            <View className="rounded-full border border-[#21406d] bg-[#102443] px-3 py-1.5">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-[#9cb7e1]">
                Status: {sessionStatusLabel}
              </Text>
            </View>
          </View>
        </View>

        <View className="gap-5 xl:flex-row">
          <View className="flex-[1.25] gap-5">
            <SafeAreaView className="overflow-hidden rounded-[28px] border border-tato-line bg-black">
              <View className="absolute inset-x-0 top-0 z-20 flex-row items-center justify-between px-5 pt-5">
                <View className="rounded-full bg-tato-accent px-3 py-1.5">
                  <Text className="font-mono text-[10px] uppercase tracking-[1px] text-white">Live Preview</Text>
                </View>
                <View className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5">
                  <Text className="font-mono text-[10px] uppercase tracking-[1px] text-white">
                    {cameraGranted ? 'Camera Ready' : 'Preview Locked'}
                  </Text>
                </View>
              </View>

              <View className="aspect-[1.08]">
                {cameraGranted ? (
                  <CameraView
                    active
                    facing="back"
                    mode="video"
                    mute={!microphoneGranted}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <View className="flex-1 items-center justify-center px-8">
                    {status === 'permissions' ? <ActivityIndicator color="#1e6dff" /> : null}
                    <Text className="mt-4 text-center text-sm leading-6 text-tato-muted">
                      Enable camera access to stage the live intake preview. This screen will be the visual anchor while Gemini watches the table and asks for better angles.
                    </Text>
                  </View>
                )}
              </View>
            </SafeAreaView>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">Conversation Preview</Text>
              <View className="mt-4 gap-3">
                {transcriptPreview.map((line, index) => (
                  <View
                    className={`rounded-[18px] border px-4 py-3 ${line.tone === 'accent' ? 'border-tato-accent/30 bg-[#102443]' : 'border-tato-line bg-tato-panelSoft'}`}
                    key={`${line.speaker}-${index}`}>
                    <Text className={`font-mono text-[10px] uppercase tracking-[1px] ${line.tone === 'accent' ? 'text-tato-accent' : 'text-tato-dim'}`}>
                      {line.speaker}
                    </Text>
                    <Text className="mt-2 text-sm leading-6 text-tato-text">{line.body}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View className="flex-1 gap-5">
            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">Preflight</Text>
              <Text className="mt-3 text-xl font-bold text-tato-text">Session bootstrap before media streaming.</Text>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">
                The app requests permissions locally, then asks the Google Cloud live agent service for an ephemeral Gemini Live bootstrap. The native media transport can attach to that short-lived token without exposing your model key in the client.
              </Text>

              <View className="mt-5 gap-3">
                <PressableScale
                  className="rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3"
                  onPress={requestPermissions}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Enable Camera & Mic
                  </Text>
                </PressableScale>

                <PressableScale
                  className={`rounded-full px-4 py-3 ${canRequestSession ? 'bg-tato-accent' : 'bg-[#26446e]'}`}
                  disabled={!canRequestSession || status === 'requesting'}
                  onPress={startSession}>
                  {status === 'requesting' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                      Request Live Session
                    </Text>
                  )}
                </PressableScale>
              </View>

              {error ? <Text className="mt-4 text-sm leading-6 text-tato-error">{error}</Text> : null}
            </View>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">Bootstrap Details</Text>
              <View className="mt-4 gap-3">
                <InfoRow label="Session" value={bootstrap?.sessionId ?? '--'} />
                <InfoRow label="Model" value={bootstrap?.model ?? 'Awaiting session'} />
                <InfoRow label="Region" value={bootstrap?.googleCloudRegion ?? 'Google Cloud'} />
                <InfoRow
                  label="Modalities"
                  value={bootstrap?.responseModalities.length ? bootstrap.responseModalities.join(', ') : 'AUDIO'}
                />
                <InfoRow
                  label="Token Expiry"
                  value={bootstrap?.ephemeralToken.expireTime ? new Date(bootstrap.ephemeralToken.expireTime).toLocaleTimeString() : '--'}
                />
              </View>

              {bootstrap?.instructions ? (
                <View className="mt-4 rounded-[18px] border border-tato-accent/25 bg-[#102443] p-4">
                  <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-accent">System Instruction</Text>
                  <Text className="mt-2 text-sm leading-6 text-tato-text">{bootstrap.instructions}</Text>
                </View>
              ) : null}
            </View>

            <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">Fallbacks</Text>
              <Text className="mt-3 text-sm leading-7 text-tato-muted">
                Keep the standard capture options one tap away. Live intake should be the fastest path, not the only path.
              </Text>

              <View className="mt-4 gap-3">
                <PressableScale
                  className="rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3"
                  onPress={() => router.push('/(app)/ingestion?entry=camera' as never)}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Switch To Camera Capture
                  </Text>
                </PressableScale>
                <PressableScale
                  className="rounded-full border border-tato-line bg-tato-panelSoft px-4 py-3"
                  onPress={() => router.push('/(app)/ingestion?entry=upload' as never)}>
                  <Text className="text-center font-mono text-xs font-semibold uppercase tracking-[1px] text-tato-text">
                    Switch To Photo Upload
                  </Text>
                </PressableScale>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </ModeShell>
  );
}
