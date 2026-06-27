<!--
  Created by GuntherCloudSolutions
  Last updated: 2026-06-27 22:20:15
-->

# Supabase Auth Setup — CloseTheOffer

Authentication and registration are wired to Supabase. They go live the moment you
add your project keys. Until then, the app loads without an auth gate so local
development keeps working.

## 1. Create the project

1. Go to https://supabase.com and create a new project.
2. Wait for it to finish provisioning.
3. Open **Project Settings → API** and copy:
   - **Project URL** (e.g. `https://abcdwxyz.supabase.co`)
   - **anon public** key (a long `eyJ...` string)

The anon key is meant for the browser and is safe to commit — it's protected by
Row Level Security. **Never** put the `service_role` key in client code.

## 2. Add your keys

Edit **`supabase-config.js`** and replace the two placeholders:

```js
const SUPABASE_URL = 'https://abcdwxyz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...your-anon-key...';
```

That's the only file you edit — login, dashboard, and the app all read from it.

## 3. Enable Email auth

In **Authentication → Providers → Email**, make sure Email is enabled.

Under **Authentication → Sign In / Providers → Email**, the **"Confirm email"**
toggle decides the signup flow — both cases are already handled in code:

- **Confirm email ON** → after signup the user sees "Check your email…", clicks the
  link, then signs in.
- **Confirm email OFF** → signup logs the user straight in and sends them to the app.

## 4. Enable Google sign-in (optional but requested)

1. In **Authentication → Providers → Google**, toggle it on.
2. Create an OAuth client in the
   [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services →
   Credentials → OAuth client ID → Web application**.
3. Add this **Authorized redirect URI** (Supabase shows the exact value to copy):
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
4. Paste the Google **Client ID** and **Client secret** into Supabase and save.

If Google isn't configured, the "Continue with Google" button shows a clear message
instead of failing silently.

## 5. Set redirect / site URLs

In **Authentication → URL Configuration**:

- **Site URL**: your production origin, e.g. `https://closetheoffer.com`
- **Redirect URLs**: add both
  - `https://closetheoffer.com/dashboard`
  - `http://localhost:3000/dashboard` (or whatever you use locally)

The app sends users to `/dashboard` after Google sign-in; that page reads the
session and forwards to the app.

## How the flow works

```
index → /login ──signup──▶ (confirm email or instant) ──▶ /dashboard ──▶ /app
              └─signin───────────────────────────────────▶ /dashboard ──▶ /app
/dashboard: no session → /login.   /app: no session → /login.   Sign out → /login.
```

- **Registration** uses `supabase.auth.signUp`.
- **Sign-in** uses `supabase.auth.signInWithPassword`.
- **Google** uses `supabase.auth.signInWithOAuth({ provider: 'google' })`.
- **/dashboard** and **/app** call `requireSession()` and bounce to `/login` if there's
  no session. The **Sign out** button in the app header calls `signOut()`.
- **Free mode** (`/freemode` → `app-free.html`) is intentionally NOT gated — it's the
  no-account experience.

## Notes

- `/app` is reached via the `/:username` route in `vercel.json`, so every signed-in
  visit to `/<anything>` loads the gated app. If you ever want public per-username
  pages, remove the gate `<script>` block near the top of `app.html`.
- Password length: Supabase enforces its own minimum (default 6). The form asks for 8.
