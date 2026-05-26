import type { ThemeColors } from '../../../lib/theme';

export function getProxyChromeColors(colors: ThemeColors) {
  return {
    background: colors.proxyPreviewBackground,
    border: colors.proxyPreviewBorder,
    sceneBackground: colors.proxyPreviewSceneBackground,
    tabBackground: colors.proxyPreviewTabBackground,
  };
}
