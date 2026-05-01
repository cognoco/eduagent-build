// Reproduce BUG-947 against the deployed staging Worker via HTTP, using a
// real Clerk session for the seeded parent user.
//
// 1. Resolve seeded parent's clerkUserId
// 2. Use Clerk's backend "actor token" API to mint a session JWT
// 3. POST /v1/profiles with Authorization: Bearer <jwt>
const https = require('https');

const SECRET = process.env.CLERK_SECRET_KEY;
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api-stg.mentomate.com';
const TEST_SECRET = process.env.TEST_SEED_SECRET;

if (!SECRET) throw new Error('CLERK_SECRET_KEY not set');
if (!TEST_SECRET) throw new Error('TEST_SEED_SECRET not set');

const SEED_EMAIL = 'bug947-repro@example.com';

function req(method, url, headers = {}, body = undefined) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    const r = https.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      );
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

async function main() {
  // 1. Look up seeded user via debug endpoint
  console.log('1. Looking up seeded user…');
  const dbg = await req(
    'GET',
    `${API_BASE}/v1/__test/debug/${encodeURIComponent(SEED_EMAIL)}`,
    { 'X-Test-Secret': TEST_SECRET }
  );
  if (dbg.status !== 200) {
    console.error('debug failed', dbg);
    return;
  }
  const dbgJson = JSON.parse(dbg.body);
  const account = dbgJson.accounts[0];
  if (!account) {
    console.error('no seeded account');
    return;
  }
  console.log('   account:', account.id, 'clerk:', account.clerkUserId);
  console.log('   profiles:', account.profiles.length);

  // 2. Mint an actor token / session JWT via Clerk Backend API
  // Clerk: POST /v1/sign_in_tokens with user_id → returns a sign-in token URL
  // that the frontend exchanges for a session. Easier: use sessions API to
  // create a session directly.
  console.log('\n2. Creating Clerk sign-in token for', account.clerkUserId);
  const tokenResp = await req(
    'POST',
    'https://api.clerk.com/v1/sign_in_tokens',
    { Authorization: `Bearer ${SECRET}` },
    { user_id: account.clerkUserId, expires_in_seconds: 600 }
  );
  console.log('   sign_in_tokens →', tokenResp.status);
  if (tokenResp.status !== 200) {
    console.error(tokenResp.body);
    return;
  }

  // The sign_in_token must be exchanged through the Clerk frontend API. Easier
  // path: use Clerk's "create session" endpoint directly with our backend key.
  console.log('\n3. Creating session via backend API');
  const sessionResp = await req(
    'POST',
    'https://api.clerk.com/v1/sessions',
    { Authorization: `Bearer ${SECRET}` },
    { user_id: account.clerkUserId }
  );
  console.log('   sessions →', sessionResp.status);
  if (sessionResp.status >= 400) {
    console.error(sessionResp.body);
    return;
  }
  const session = JSON.parse(sessionResp.body);
  console.log('   session id:', session.id);

  // 4. Create a session token (JWT) for that session
  console.log('\n4. Minting session JWT');
  const jwtResp = await req(
    'POST',
    `https://api.clerk.com/v1/sessions/${session.id}/tokens`,
    { Authorization: `Bearer ${SECRET}` },
    { expires_in_seconds: 600 }
  );
  console.log('   tokens →', jwtResp.status);
  if (jwtResp.status >= 400) {
    console.error(jwtResp.body);
    return;
  }
  const { jwt } = JSON.parse(jwtResp.body);
  console.log('   jwt prefix:', jwt.slice(0, 40), '…');

  // 5. POST /v1/profiles
  console.log('\n5. POST /v1/profiles with Bearer token');
  const create = await req(
    'POST',
    `${API_BASE}/v1/profiles`,
    {
      Authorization: `Bearer ${jwt}`,
      'X-Profile-Id': account.profiles[0].id,
    },
    { displayName: 'BUG-947 Repro Child', birthYear: 2013 }
  );
  console.log('\n=== CREATE RESPONSE ===');
  console.log('status:', create.status);
  console.log('headers:', create.headers);
  console.log('body:', create.body);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
