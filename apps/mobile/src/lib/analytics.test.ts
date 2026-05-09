import { Sentry } from './sentry';
import { track, trackHomeworkOcrGateAccepted } from './analytics';

describe('analytics telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records analytics events as breadcrumbs, not standalone Sentry issues', () => {
    track('subscription_breakdown_viewed', {
      breakdown_section_visible: true,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics',
      level: 'info',
      message: 'subscription_breakdown_viewed',
      data: {
        event: 'subscription_breakdown_viewed',
        breakdown_section_visible: true,
      },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('records OCR gate telemetry as breadcrumbs', () => {
    trackHomeworkOcrGateAccepted({
      source: 'local',
      tokens: 12,
      words: 6,
      confidence: 0.87654,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics.homework_ocr_gate',
      level: 'info',
      message: 'homework_ocr_gate_accepted',
      data: {
        source: 'local',
        tokens: 12,
        words: 6,
        confidence: 0.877,
      },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
