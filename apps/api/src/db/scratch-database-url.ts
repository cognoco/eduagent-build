interface ScratchDatabaseUrls {
  directUrl?: string;
  databaseUrl?: string;
}

export function resolveScratchDatabaseUrl({
  directUrl,
  databaseUrl,
}: ScratchDatabaseUrls): string {
  if (directUrl) return directUrl;
  if (!databaseUrl) {
    throw new Error(
      'DIRECT_URL or DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }

  const url = new URL(databaseUrl);
  const [endpoint, ...hostnameSuffix] = url.hostname.split('.');
  if (url.hostname.endsWith('.neon.tech') && endpoint?.endsWith('-pooler')) {
    url.hostname = [
      endpoint.slice(0, -'-pooler'.length),
      ...hostnameSuffix,
    ].join('.');
    return url.toString();
  }

  return databaseUrl;
}
