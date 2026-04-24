import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { TatoButton } from '@/components/ui/TatoButton';

export type NextStepAction = {
  label: string;
  href?: string;
  onPress?: () => void;
  tone?: 'primary' | 'secondary' | 'success';
};

type NextStepProps = {
  headline: string;
  description: string;
  primaryAction: NextStepAction;
  secondaryAction?: NextStepAction;
  testID?: string;
};

function ActionButton({ action, primary }: { action: NextStepAction; primary?: boolean }) {
  const button = (
    <TatoButton
      accessibilityLabel={action.label}
      className="flex-1"
      label={action.label}
      onPress={action.onPress}
      size="md"
      tone={action.tone ?? (primary ? 'primary' : 'secondary')}
    />
  );

  if (action.href) {
    return (
      <Link asChild href={action.href as never}>
        {button}
      </Link>
    );
  }

  return button;
}

export function NextStep({
  headline,
  description,
  primaryAction,
  secondaryAction,
  testID,
}: NextStepProps) {
  return (
    <View className="rounded-[24px] border border-tato-accent/35 bg-[#102443] p-5" testID={testID}>
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-accent">
        What happens now
      </Text>
      <Text className="mt-2 text-xl font-sans-bold text-tato-text">{headline}</Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">{description}</Text>
      <View className="mt-4 gap-3">
        <ActionButton action={primaryAction} primary />
        {secondaryAction ? <ActionButton action={secondaryAction} /> : null}
      </View>
    </View>
  );
}

export function ActionConfirmation({
  acknowledgment,
  systemContext,
  crossPersonaNote,
  nextSteps,
  testID,
}: {
  acknowledgment: string;
  systemContext: string;
  crossPersonaNote: string;
  nextSteps: NextStepAction[];
  testID?: string;
}) {
  const [primaryAction, secondaryAction] = nextSteps;

  return (
    <View className="rounded-[24px] border border-tato-profit/30 bg-tato-profit/10 p-5" testID={testID}>
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-profit">
        Confirmed
      </Text>
      <Text className="mt-2 text-xl font-sans-bold text-tato-text">{acknowledgment}</Text>
      <Text className="mt-2 text-sm leading-6 text-tato-muted">{systemContext}</Text>
      <Text className="mt-2 text-sm leading-6 text-tato-text">{crossPersonaNote}</Text>
      {primaryAction ? (
        <View className="mt-4 gap-3">
          <ActionButton action={primaryAction} primary />
          {secondaryAction ? <ActionButton action={secondaryAction} /> : null}
        </View>
      ) : null}
    </View>
  );
}
