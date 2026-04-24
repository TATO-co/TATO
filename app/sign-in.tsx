import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthAccessCard } from '@/components/auth/AuthAccessCard';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { useViewportInfo } from '@/lib/constants';
import { HIT_SLOP, PRESS_FEEDBACK, RADIUS, SPACE, TOUCH_TARGET } from '@/lib/ui';

const accessRoutes = [
  {
    label: 'Supplier',
    title: 'Live intake and listings',
    value: 'Camera first',
  },
  {
    label: 'Broker',
    title: 'Claim desk and wallet',
    value: 'Margin visible',
  },
  {
    label: 'Admin',
    title: 'Access review',
    value: 'Approval gated',
  },
];

function AccessRouteRow({ label, title, value }: { label: string; title: string; value: string }) {
  return (
    <View style={styles.routeRow}>
      <View style={styles.routeDot}>
        <PlatformIcon color="#8ab1ff" name="check" size={14} />
      </View>
      <View style={styles.routeBody}>
        <Text style={styles.routeLabel}>{label}</Text>
        <Text style={styles.routeTitle}>{title}</Text>
      </View>
      <Text style={styles.routeValue}>{value}</Text>
    </View>
  );
}

function DesktopAccessPanel() {
  return (
    <View style={styles.accessPanel}>
      <Text style={styles.accessEyebrow}>After The Code</Text>
      <Text aria-level={2} role="heading" style={styles.accessTitle}>
        The same sign-in opens the right workspace.
      </Text>
      <Text style={styles.accessCopy}>
        TATO checks your profile, role, and account status before sending you into the operator surface you use.
      </Text>

      <View style={styles.routeList}>
        {accessRoutes.map((route) => (
          <AccessRouteRow key={route.label} {...route} />
        ))}
      </View>

      <View style={styles.supportBox}>
        <View>
          <Text style={styles.supportLabel}>Need help?</Text>
          <Text style={styles.supportCopy}>Payments, pickup, and access support stay public.</Text>
        </View>
        <Link asChild href="/support">
          <Pressable
            accessibilityLabel="Open TATO support"
            accessibilityRole="link"
            android_ripple={PRESS_FEEDBACK.ripple.subtle}
            hitSlop={HIT_SLOP.comfortable}
            style={styles.supportButton}>
            <PlatformIcon color="#edf4ff" name="support-agent" size={18} />
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

export default function SignInScreen() {
  const { isDesktop, isPhone, pageGutter } = useViewportInfo();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['#07172d', '#030a16', '#010409']}
          locations={[0, 0.52, 1]}
          style={StyleSheet.absoluteFill}
        />
        {Platform.OS === 'web' ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.gridOverlay,
            ]}
          />
        ) : null}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: pageGutter,
              paddingVertical: isPhone ? 12 : 28,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <View style={[styles.container, isDesktop ? styles.containerDesktop : styles.containerMobile]}>
            <View style={[styles.authColumn, isDesktop ? styles.authColumnDesktop : null]}>
              <View style={styles.topRail}>
                <Link asChild href="/">
                  <Pressable
                    accessibilityLabel="Open the welcome page"
                    accessibilityRole="link"
                    android_ripple={PRESS_FEEDBACK.ripple.subtle}
                    hitSlop={HIT_SLOP.comfortable}
                    style={styles.homeButton}
                    testID="signin-back-button">
                    <PlatformIcon color="#8ea4c8" name="arrow-back" size={18} />
                    <Text style={styles.homeButtonText}>TATO</Text>
                  </Pressable>
                </Link>
                <Text style={styles.routeTag} testID="signin-route-tag">Secure Code Sign-In</Text>
              </View>

              <AuthAccessCard
                description="Use your work email once. TATO sends the code, checks your role, and opens the right workspace."
                eyebrow="TATO ACCESS"
                title="Access TATO."
                variant="signIn"
              />
            </View>

            {isDesktop ? <DesktopAccessPanel /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#010409',
  },
  gridOverlay: {
    opacity: 0.04,
    backgroundImage:
      'linear-gradient(rgba(237,244,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(237,244,255,0.05) 1px, transparent 1px)',
    backgroundSize: '42px 42px',
  } as never,
  keyboard: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  containerDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE[24],
  },
  containerMobile: {
    justifyContent: 'center',
    maxWidth: 560,
  },
  authColumn: {
    width: '100%',
    gap: SPACE[16],
  },
  authColumnDesktop: {
    flexBasis: 500,
    flexShrink: 0,
  },
  topRail: {
    minHeight: TOUCH_TARGET.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE[12],
  },
  homeButton: {
    minHeight: TOUCH_TARGET.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[8],
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#1c3358',
    backgroundColor: 'rgba(18, 36, 63, 0.86)',
    paddingHorizontal: SPACE[16],
  },
  homeButtonText: {
    color: '#edf4ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  routeTag: {
    color: '#64779c',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  accessPanel: {
    flex: 1,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: '#1c3358',
    backgroundColor: 'rgba(7, 17, 33, 0.78)',
    padding: SPACE[24],
  },
  accessEyebrow: {
    color: '#1e6dff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  accessTitle: {
    marginTop: 12,
    color: '#edf4ff',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  accessCopy: {
    marginTop: 14,
    color: '#8ea4c8',
    fontSize: 15,
    lineHeight: 24,
  },
  routeList: {
    marginTop: 24,
    gap: 10,
  },
  routeRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#17355f',
    backgroundColor: 'rgba(9, 23, 45, 0.78)',
    paddingHorizontal: 14,
  },
  routeDot: {
    height: 30,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(30, 109, 255, 0.13)',
  },
  routeBody: {
    flex: 1,
  },
  routeLabel: {
    color: '#8ab1ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  routeTitle: {
    marginTop: 3,
    color: '#edf4ff',
    fontSize: 15,
    fontWeight: '700',
  },
  routeValue: {
    color: '#8ea4c8',
    fontSize: 12,
    fontWeight: '700',
  },
  supportBox: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#21406d',
    backgroundColor: 'rgba(18, 36, 63, 0.72)',
    padding: 16,
  },
  supportLabel: {
    color: '#edf4ff',
    fontSize: 15,
    fontWeight: '800',
  },
  supportCopy: {
    marginTop: 3,
    color: '#8ea4c8',
    fontSize: 13,
    lineHeight: 19,
  },
  supportButton: {
    height: TOUCH_TARGET.minimum,
    width: TOUCH_TARGET.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#28508b',
    backgroundColor: 'rgba(30, 109, 255, 0.18)',
  },
});
