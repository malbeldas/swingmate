// Shared by the account E2E tests: the local Supabase config, Mailpit and a ready-made member.
import { existsSync, readFileSync } from 'node:fs';

const configFile = new URL('../../app/config.local.json', import.meta.url);
export const local = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : null;
export const PASSWORD = 'pilot-perth-2026';

export function requireLocalSupabase() {
  if (!local?.url) throw new Error('No local Supabase: run `supabase start` and `npm run local:config` first.');
}

export function uniqueEmail(testInfo, who = 'ana') {
  return `${who}.${Date.now()}.${testInfo.project.name}.${testInfo.retry}@example.com`;
}

export function sheet(page) {
  return page.locator('#auth-sheet');
}

// The newest email to `email` whose subject matches, as Mailpit stores it.
export async function emailTo(request, email, subject) {
  for (let i = 0; i < 30; i++) {
    const res = await request.get(`${local.mailpitUrl}/api/v1/search`, { params: { query: `to:"${email}"` } });
    const { messages = [] } = await res.json();
    const found = messages.find((m) => subject.test(m.Subject ?? ''));
    if (found) return (await request.get(`${local.mailpitUrl}/api/v1/message/${found.ID}`)).json();
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email matching ${subject} for ${email}`);
}

// NTF-001: the code is in the subject, "Your SwingMate code: 123456".
export async function codeFor(request, email) {
  const message = await emailTo(request, email, /Your SwingMate code: \d{6}/);
  return message.Subject.match(/(\d{6})/)[1];
}

export function authPost(request, path, data, token) {
  return request.post(`${local.url}/auth/v1/${path}`, {
    headers: { apikey: local.anonKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    data,
  });
}

// A confirmed member with the minimum profile (BR-ACC-003), made through the API like the sheet
// does. Returns the session, so a test can check later whether it still works.
export async function createMember(request, email, name = 'Ana') {
  expect200(await authPost(request, 'signup', { email, password: PASSWORD }), 'signup');
  const verify = await authPost(request, 'verify', { type: 'signup', email, token: await codeFor(request, email) });
  expect200(verify, 'verify');
  const session = await verify.json();
  const profile = await request.post(`${local.url}/rest/v1/profiles`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    data: {
      id: session.user.id, display_name: name, base_suburb_id: 90001, is_seeking: true, is_hosting: false,
      terms_version: 'uat-2026-11', terms_accepted_at: new Date().toISOString(),
    },
  });
  expect200(profile, 'profile');
  return session;
}

function expect200(res, what) {
  if (!res.ok()) throw new Error(`${what} failed with ${res.status()}`);
}

// The example host in supabase/seed.sql, who can sign in only in the local and CI auth (UC-023).
export const SEED_HOST = { email: 'seed-host@example.test', password: 'seed-host-local-only' };

// UC-004 through the API, as the person with this session would send it from the detail.
export async function startConversation(request, session, listingId, body, stayFrom, stayTo) {
  const res = await request.post(`${local.url}/rest/v1/rpc/start_conversation`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    data: { p_listing_id: listingId, p_body: body, p_stay_from: stayFrom, p_stay_to: stayTo },
  });
  const result = await res.json();
  if (!result?.ok) throw new Error(`start_conversation failed: ${JSON.stringify(result)}`);
  return result.conversation_id;
}
