import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthAccessCard } from '@/components/auth/AuthAccessCard';

function AccessStep({
  step,
  title,
  detail,
}: {
  step: string;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step}</Text>
        </View>
        <View style={styles.stepBody}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.stepDetail}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}

export default function SignInScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.scrollView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
        <View style={styles.container}>
          <View style={styles.heroCard}>
            <View style={styles.monogram}>
              <Text style={styles.monogramText}>T</Text>
            </View>

            <Text style={styles.eyebrow}>TATO ACCESS</Text>
            <Text style={styles.title}>Sign in with your work email.</Text>
            <Text style={styles.description}>
              One secure flow covers suppliers, brokers, and new operators. We send a one-time code and route you into the right workspace.
            </Text>
          </View>

          <AuthAccessCard
            className="mt-5"
            description="One sign-in opens supplier intake, broker workflow, and persona setup for new operators."
            eyebrow="TATO ACCESS"
            title="Access TATO."
            variant="signIn"
          />

          <View style={styles.stepsSection}>
            <Text style={styles.stepsHeading}>What happens next</Text>
            <View style={styles.steps}>
              <AccessStep
                detail="Use the address tied to your TATO workspace or onboarding invite."
                step="1"
                title="Enter your work email"
              />
              <AccessStep
                detail="We email a one-time code instead of asking you to manage a password."
                step="2"
                title="Open the latest code"
              />
              <AccessStep
                detail="Existing operators return to their workspace. New operators continue into setup."
                step="3"
                title="Land in the right mode"
              />
            </View>

            <Link asChild href="/">
              <Pressable accessibilityLabel="Open the welcome page" style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Open Welcome Page</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07101c',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  heroCard: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#17355f',
    backgroundColor: 'rgba(7, 17, 33, 0.92)',
    padding: 24,
  },
  monogram: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
  },
  eyebrow: {
    marginTop: 24,
    color: '#1e6dff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },
  title: {
    marginTop: 12,
    color: '#f4f7fb',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  description: {
    marginTop: 16,
    color: '#9db3c7',
    fontSize: 16,
    lineHeight: 26,
  },
  stepsSection: {
    marginTop: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#17355f',
    backgroundColor: 'rgba(7, 17, 33, 0.88)',
    padding: 20,
  },
  stepsHeading: {
    color: '#f4f7fb',
    fontSize: 17,
    fontWeight: '600',
  },
  steps: {
    marginTop: 14,
    gap: 12,
  },
  stepCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#17355f',
    backgroundColor: 'rgba(7, 23, 45, 0.92)',
    padding: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 109, 255, 0.15)',
  },
  stepBadgeText: {
    color: '#1e6dff',
    fontSize: 11,
    fontWeight: '700',
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    color: '#f4f7fb',
    fontSize: 16,
    fontWeight: '600',
  },
  stepDetail: {
    marginTop: 4,
    color: '#9db3c7',
    fontSize: 14,
    lineHeight: 22,
  },
  linkButton: {
    alignSelf: 'flex-start',
    marginTop: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#295088',
    backgroundColor: 'rgba(12, 24, 48, 0.92)',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  linkButtonText: {
    color: '#f4f7fb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
