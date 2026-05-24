export type LoadingMotionRole = 'empty' | 'screen' | 'context' | 'inline';
export type CelebrationMotionRole = 'hero' | 'context' | 'inline';

type MotionPlacement =
  | 'center'
  | 'center-burst'
  | 'contained'
  | 'inline'
  | 'panel';

interface MotionPreset<Role extends string> {
  role: Role;
  size: number;
  placement: MotionPlacement;
}

export const motionPresets = {
  loading: {
    empty: { role: 'empty', size: 160, placement: 'center' },
    screen: { role: 'screen', size: 150, placement: 'center' },
    context: { role: 'context', size: 96, placement: 'panel' },
    inline: { role: 'inline', size: 56, placement: 'inline' },
  },
  celebration: {
    hero: { role: 'hero', size: 140, placement: 'center-burst' },
    context: { role: 'context', size: 80, placement: 'contained' },
    inline: { role: 'inline', size: 56, placement: 'inline' },
  },
} as const satisfies {
  loading: Record<LoadingMotionRole, MotionPreset<LoadingMotionRole>>;
  celebration: Record<
    CelebrationMotionRole,
    MotionPreset<CelebrationMotionRole>
  >;
};

export const LOADING_CONTEXT_BACKDROP_OPACITY = 0.96;

export type LoadingMotionSurface = 'screen' | 'overlay' | 'inline';
export type LoadingMotionContentDensity = 'none' | 'sparse' | 'dense';

export function getLoadingMotionPreset(
  role: LoadingMotionRole,
): MotionPreset<LoadingMotionRole> {
  return motionPresets.loading[role];
}

export function getCelebrationMotionPreset(
  role: CelebrationMotionRole,
): MotionPreset<CelebrationMotionRole> {
  return motionPresets.celebration[role];
}

export function resolveLoadingMotionPreset({
  brandMoment = false,
  contentDensity,
  surface,
}: {
  brandMoment?: boolean;
  contentDensity: LoadingMotionContentDensity;
  surface: LoadingMotionSurface;
}): MotionPreset<LoadingMotionRole> {
  if (surface === 'inline') {
    return getLoadingMotionPreset('inline');
  }

  if (surface === 'overlay' || contentDensity === 'dense') {
    return getLoadingMotionPreset('context');
  }

  if (brandMoment || contentDensity === 'none') {
    return getLoadingMotionPreset('empty');
  }

  return getLoadingMotionPreset('screen');
}
