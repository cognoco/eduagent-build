const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array, take: number): string {
  let hex = '';
  for (let i = 0; i < take; i += 1) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

export async function hashProfileIdForAnalytics(
  profileId: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(profileId),
  );
  return `v3_${bytesToHex(new Uint8Array(digest), 16)}`;
}
