const MODE_NAV_PUBLIC_ENV_KEYS = [
  'EXPO_PUBLIC_ENABLE_MODE_NAV',
  'EXPO_PUBLIC_ENABLE_MODE_NAV_V1',
  'EXPO_PUBLIC_ENABLE_MODE_NAV_V2',
];

function replaceOrAppend(contents, key, value) {
  const replacement = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*`, 'm');
  if (pattern.test(contents)) {
    return contents.replace(pattern, replacement);
  }
  const suffix = contents.endsWith('\n') || contents.length === 0 ? '' : '\n';
  return `${contents}${suffix}${replacement}\n`;
}

function isExplicitBoolean(value) {
  return value === 'true' || value === 'false';
}

export function applyExpoPublicEnvOverrides(contents, env) {
  let next = replaceOrAppend(
    contents,
    'EXPO_PUBLIC_API_URL',
    env.EXPO_PUBLIC_API_URL,
  );
  // This helper only builds the Playwright host. A staging/store value of
  // false must not disable the guarded routes the web suite is exercising.
  next = replaceOrAppend(next, 'EXPO_PUBLIC_E2E', 'true');

  for (const key of MODE_NAV_PUBLIC_ENV_KEYS) {
    const value = env[key];
    if (isExplicitBoolean(value)) {
      next = replaceOrAppend(next, key, value);
    }
  }

  return next;
}
