/*
  Created by GuntherCloudSolutions
  Last updated: 2026-06-27 22:20:15
*/

/*
  CloseTheOffer — Supabase configuration (shared by login, dashboard, and app)

  SETUP (see SUPABASE_SETUP.md for the full checklist):
    1. Create a project at https://supabase.com
    2. Project Settings → API → copy "Project URL" and the "anon public" key
    3. Paste them into the two constants below
    4. Enable Email auth and (optionally) the Google provider in Authentication → Providers

  The anon key is safe to expose in client code — it is protected by Supabase
  Row Level Security. Do NOT put the service_role key here.
*/

const SUPABASE_URL = 'https://emwrhjmdaxcevqxiyrbe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_haK80kCzfxKwqYGOCz1aZQ_PLYGufTq';

/* ────────── do not edit below unless you know what you're doing ────────── */

const SUPABASE_CONFIGURED =
  !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');

let _sbClient = null;

// Returns a singleton Supabase client, or null if not configured yet.
function getSupabase() {
  if (!SUPABASE_CONFIGURED) return null;
  if (_sbClient) return _sbClient;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase SDK not found. Load the CDN script BEFORE supabase-config.js.');
    return null;
  }
  _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return _sbClient;
}

// Map raw Supabase/auth errors to friendly, user-facing text.
function friendlyAuthError(err) {
  const msg = (err && err.message) ? err.message : 'Something went wrong. Please try again.';
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'An account with this email already exists. Try signing in instead.';
  if (/password should be at least/i.test(msg)) return msg; // already friendly
  if (/unable to validate email|invalid email|invalid format/i.test(msg)) return 'Please enter a valid email address.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the verification link.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a moment and try again.';
  if (/provider is not enabled/i.test(msg)) return 'Google sign-in isn\'t enabled yet. Configure the Google provider in Supabase.';
  return msg;
}

// Gate a private page: redirect to `redirectTo` when there is no active session.
// Returns the session (or null). When Supabase isn't configured it does NOT block,
// so the app still runs during local development.
async function requireSession(redirectTo = '/login') {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (!data || !data.session) { window.location.replace(redirectTo); return null; }
  return data.session;
}

// Sign the current user out, then send them to `redirectTo`.
async function signOut(redirectTo = '/login') {
  const sb = getSupabase();
  if (sb) { try { await sb.auth.signOut(); } catch (e) { /* ignore */ } }
  window.location.replace(redirectTo);
}
