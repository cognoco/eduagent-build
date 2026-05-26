import { useTranslation } from 'react-i18next';

import { ExplainedRedirect } from '../../../components/common/ExplainedRedirect';

export default function OnboardingIndex(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <ExplainedRedirect
      href="/(app)/onboarding/pronouns"
      title={t('onboarding.index.redirectTitle', {
        defaultValue: 'First, let’s personalise a couple of basics',
      })}
      message={t('onboarding.index.redirectBody', {
        defaultValue:
          'We’ll start with pronouns so the next steps feel right from the beginning.',
      })}
      ctaLabel={t('common.continue')}
      testID="onboarding-index-redirect"
      ctaTestID="onboarding-index-continue"
    />
  );
}
