export function packageManagerLaunch(pnpmCli, nodeExecutable) {
  const normalized = pnpmCli?.trim();
  if (!normalized) {
    throw new Error('npm_execpath is required');
  }
  return /\.(?:[cm]?js)$/i.test(normalized)
    ? { binary: nodeExecutable, args: [normalized] }
    : { binary: normalized, args: [] };
}
