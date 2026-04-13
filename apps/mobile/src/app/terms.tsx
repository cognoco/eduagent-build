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

export default function TermsOfServiceScreen() {
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
          Terms of Service
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text className="text-caption text-text-secondary mb-4">
          Last updated: March 2026
        </Text>

        <Section title="1. Acceptance of Terms">
          <Paragraph>
            By creating an account or using MentoMate, you agree to these Terms
            of Service. If you are under 18, your parent or guardian must agree
            on your behalf.
          </Paragraph>
        </Section>

        <Section title="2. Description of Service">
          <Paragraph>
            MentoMate is an AI-powered tutoring platform that provides
            personalised learning through Socratic dialogue, spaced repetition,
            and adaptive curricula. The service is designed for students aged
            11-15 with parental oversight.
          </Paragraph>
        </Section>

        <Section title="3. Account Responsibilities">
          <Paragraph>
            You are responsible for maintaining the confidentiality of your
            account credentials. You must provide accurate information during
            registration. You must not share your account with others or create
            multiple accounts.
          </Paragraph>
        </Section>

        <Section title="4. Acceptable Use">
          <Paragraph>
            MentoMate is for educational purposes only. You agree not to: use
            the service for any unlawful purpose; attempt to circumvent safety
            features; submit harmful, abusive, or inappropriate content; reverse
            engineer or attempt to extract the AI models or algorithms.
          </Paragraph>
        </Section>

        <Section title="5. AI-Generated Content">
          <Paragraph>
            MentoMate uses AI to generate educational content. While we strive
            for accuracy, AI responses may occasionally contain errors. The
            service is a learning aid and does not replace professional
            education, tutoring, or academic advice.
          </Paragraph>
        </Section>

        <Section title="6. Subscriptions &amp; Payments">
          <Paragraph>
            MentoMate offers a free tier with limited daily and monthly usage.
            Paid subscriptions are available through Apple App Store or Google
            Play Store. Subscription terms, pricing, and cancellation are
            governed by the respective app store policies. Refunds are handled
            by the app store through which you subscribed.
          </Paragraph>
        </Section>

        <Section title="7. Intellectual Property">
          <Paragraph>
            All MentoMate content, design, and technology are owned by Zwizzly.
            Your learning data (session exchanges, notes, summaries) belongs to
            you. We license it only to provide the service.
          </Paragraph>
        </Section>

        <Section title="8. Limitation of Liability">
          <Paragraph>
            MentoMate is provided &quot;as is&quot; without warranties of any
            kind. We are not liable for any indirect, incidental, or
            consequential damages arising from your use of the service. Our
            total liability is limited to the amount you paid for the service in
            the 12 months preceding the claim.
          </Paragraph>
        </Section>

        <Section title="9. Termination">
          <Paragraph>
            You may delete your account at any time from Settings. We may
            suspend or terminate accounts that violate these terms. Upon
            termination, your data is handled according to our Privacy Policy.
          </Paragraph>
        </Section>

        <Section title="10. Changes to Terms">
          <Paragraph>
            We may update these terms from time to time. We will notify you of
            material changes via email or in-app notification. Continued use
            after changes constitutes acceptance.
          </Paragraph>
        </Section>

        <Section title="11. Governing Law">
          <Paragraph>
            These terms are governed by the applicable laws of the European
            Union, including the General Data Protection Regulation (GDPR). Any
            disputes will be resolved in accordance with applicable EU consumer
            protection and data privacy regulations.
          </Paragraph>
        </Section>

        <Section title="12. Contact">
          <Paragraph>
            For questions about these terms, contact us at legal@mentomate.com.
          </Paragraph>
        </Section>
      </ScrollView>
    </View>
  );
}
