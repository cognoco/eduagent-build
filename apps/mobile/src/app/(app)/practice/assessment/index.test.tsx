import { isAssessmentReadinessReply } from './assessment-readiness';

describe('assessment readiness replies', () => {
  it('detects first-turn readiness replies that should not be graded', () => {
    expect(isAssessmentReadinessReply('go for it')).toBe(true);
    expect(isAssessmentReadinessReply('go for i')).toBe(true);
    expect(isAssessmentReadinessReply("let's go")).toBe(true);
    expect(isAssessmentReadinessReply('ready!')).toBe(true);
  });

  it('does not treat substantive answers as readiness replies', () => {
    expect(isAssessmentReadinessReply('Hola means hello')).toBe(false);
    expect(
      isAssessmentReadinessReply(
        'Common greetings include hola and buenos dias',
      ),
    ).toBe(false);
  });
});
