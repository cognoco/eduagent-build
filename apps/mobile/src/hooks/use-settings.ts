import { useQuery } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  weeklyDigest: boolean;
}

interface LearningModeSettings {
  mode: string;
  sessionDurationMinutes: number;
}

export function useNotificationSettings() {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'notifications', activeProfile?.id],
    queryFn: () => get<NotificationSettings>('/settings/notifications'),
    enabled: !!activeProfile,
  });
}

export function useLearningMode() {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'learning-mode', activeProfile?.id],
    queryFn: () => get<LearningModeSettings>('/settings/learning-mode'),
    enabled: !!activeProfile,
  });
}
