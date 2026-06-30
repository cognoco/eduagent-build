import { useTranslation } from 'react-i18next';

import { ExplainedRedirect } from '../../../components/common/ExplainedRedirect';

export default function OnboardingIndex(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <ExplainedRedirect
      href="/(app)/onboarding/pronouns"
      title={t('onboarding.index.redirectTitle')}
      message={t('onboarding.index.redirectBody')}
      ctaLabel={t('common.continue')}
      testID="onboarding-index-redirect"
      ctaTestID="onboarding-index-continue"
    />
  );
}
