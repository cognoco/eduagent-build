import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBackOrReplace } from '../lib/navigation';
import { useThemeColors } from '../lib/theme';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <Text className="text-body font-bold text-text-primary mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-body-sm text-text-secondary leading-5 mb-2">
      {children}
    </Text>
  );
}

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const handleBack = () => {
    goBackOrReplace(router, '/(app)/more');
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable
          onPress={handleBack}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          className="mr-3 w-10 h-10 items-center justify-center rounded-full bg-surface"
          testID="back-button"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          Privacy Policy
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text className="text-caption text-text-secondary mb-4">
          Last updated: March 2026
        </Text>

        <Section title="1. Who We Are">
          <Paragraph>
            MentoMate is an AI-powered tutoring platform operated by Zwizzly
            (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). We are committed
            to protecting the privacy of all our users, especially children aged
            11-15. We process personal data in accordance with the EU General
            Data Protection Regulation (GDPR).
          </Paragraph>
        </Section>

        <Section title="2. Data We Collect">
          <Paragraph>
            Account data: email address, display name, and profile information
            you provide during registration.
          </Paragraph>
          <Paragraph>
            Learning data: subjects, interview responses, curriculum progress,
            session exchanges, assessment results, retention scores, and XP.
          </Paragraph>
          <Paragraph>
            Device data: push notification tokens, device type, and app version
            for delivering notifications and maintaining service quality.
          </Paragraph>
          <Paragraph>
            We do NOT collect location data, contacts, photos (except homework
            images you explicitly capture), or browsing history.
          </Paragraph>
        </Section>

        <Section title="3. How We Use Your Data">
          <Paragraph>
            To provide personalised AI tutoring using Socratic dialogue and
            spaced repetition. To generate curricula, learning insights, and
            progress reports. To send review reminders and notifications you
            have opted into. To improve our service through anonymised,
            aggregated analytics.
          </Paragraph>
        </Section>

        <Section title="4. Parental Consent">
          <Paragraph>
            For users under 16, we require verifiable parental consent before
            processing personal data. A parent or guardian must approve the
            child&apos;s account via email before any learning data is
            collected.
          </Paragraph>
          <Paragraph>
            Parents can withdraw consent at any time from the parent dashboard.
            Upon withdrawal, the child&apos;s data enters a 7-day grace period
            and is then permanently deleted.
          </Paragraph>
        </Section>

        <Section title="5. AI Processing">
          <Paragraph>
            Learning sessions are processed by third-party AI model providers to
            generate educational responses. Session content may be sent to AI
            providers for processing but is not used to train their models. We
            do not share personally identifiable information with AI providers —
            only learning content.
          </Paragraph>
        </Section>

        <Section title="6. Data Sharing">
          <Paragraph>
            We do not sell your data. We share data only with: authentication
            provider (Clerk) for sign-in; AI providers for learning sessions;
            email provider (Resend) for notifications; error tracking (Sentry)
            for app stability; in-app purchase management (RevenueCat) for
            subscription processing; payment processors for subscription
            management.
          </Paragraph>
          <Paragraph>
            For users under 13, error tracking (Sentry) is disabled until
            parental consent is granted. It is re-disabled if consent is
            withdrawn.
          </Paragraph>
        </Section>

        <Section title="7. Data Retention">
          <Paragraph>
            We retain your data for as long as your account is active. When you
            delete your account, your data enters a 7-day grace period (during
            which you can cancel deletion), after which it is permanently
            removed.
          </Paragraph>
        </Section>

        <Section title="8. Your Rights">
          <Paragraph>
            You have the right to: access your data (via the Export feature in
            Settings); correct inaccurate data; delete your account and all
            associated data; withdraw consent for data processing; object to
            processing; data portability.
          </Paragraph>
          <Paragraph>
            To exercise these rights, use the in-app settings or contact us at
            privacy@mentomate.com.
          </Paragraph>
        </Section>

        <Section title="9. Security">
          <Paragraph>
            We use industry-standard security measures including encrypted
            connections (TLS), secure authentication, and profile-scoped data
            isolation ensuring each user can only access their own data.
          </Paragraph>
        </Section>

        <Section title="10. Contact Us">
          <Paragraph>
            For privacy questions or concerns, contact our Data Protection
            Officer at privacy@mentomate.com.
          </Paragraph>
        </Section>
      </ScrollView>
    </View>
  );
}
