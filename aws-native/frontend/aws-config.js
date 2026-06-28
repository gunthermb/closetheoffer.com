/*
  Created by GuntherCloudSolutions
  Last updated: 2026-06-28

  CloseTheOffer — AWS config + auth helpers (replaces supabase-config.js).
  Uses Amazon Cognito's native HTTPS API directly via fetch (no third-party SDK):
    - email / password  -> Cognito InitiateAuth (USER_PASSWORD_AUTH)
    - "Continue with Google" -> Cognito Hosted UI (Google federated IdP)
  and calls the resume-scan API (API Gateway -> Lambda -> Bedrock).

  Fill in the four values below from the `backend.yaml` stack Outputs after you deploy.
  All values here are safe to expose in the browser.
*/

const AWS_REGION         = 'us-east-1';                 // backend stack Region output
const COGNITO_CLIENT_ID  = 'YOUR-APP-CLIENT-ID';        // UserPoolClientId output
const HOSTED_UI_DOMAIN   = 'https://YOUR-DOMAIN.auth.us-east-1.amazoncognito.com'; // HostedUIDomain output
const API_BASE_URL       = 'https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com'; // ApiBaseUrl output
const OAUTH_REDIRECT     = window.location.origin + '/dashboard';

const AWS_CONFIGURED =
  COGNITO_CLIENT_ID.indexOf('YOUR-') === -1 && API_BASE_URL.indexOf('YOUR-') === -1;

const IDP_ENDPOINT = 'https://cognito-idp.' + AWS_REGION + '.amazonaws.com/';

/* ───────────────────────── token storage ───────────────────────── */
function ctoSetTokens(t) {
  if (t.IdToken) localStorage.setItem('cto_id_token', t.IdToken);
  if (t.AccessToken) localStorage.setItem('cto_access_token', t.AccessToken);
  if (t.RefreshToken) localStorage.setItem('cto_refresh_token', t.RefreshToken);
}
function ctoIdToken() { return localStorage.getItem('cto_id_token'); }
function ctoClearTokens() {
  ['cto_id_token', 'cto_access_token', 'cto_refresh_token'].forEach(function (k) { localStorage.removeItem(k); });
}
function ctoTokenValid() {
  const t = ctoIdToken();
  if (!t) return false;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch (e) { return false; }
}

/* ───────────────────────── Cognito IDP (native) ─────────────────── */
async function cognitoIdp(target, body) {
  const res = await fetch(IDP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.' + target,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    const e = new Error(data.message || data.__type || 'Request failed');
    e.code = data.__type;
    throw e;
  }
  return data;
}

// Create an account. Cognito emails a verification code (call ctoConfirmSignUp next).
async function ctoSignUp(email, password) {
  return cognitoIdp('SignUp', {
    ClientId: COGNITO_CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
}

// Confirm a new account with the 6-digit code from the email.
async function ctoConfirmSignUp(email, code) {
  return cognitoIdp('ConfirmSignUp', {
    ClientId: COGNITO_CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
}

// Email + password sign-in. Stores tokens on success.
async function ctoSignIn(email, password) {
  const r = await cognitoIdp('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (r.AuthenticationResult) ctoSetTokens(r.AuthenticationResult);
  return r;
}

/* ───────────────────────── Google (Hosted UI) ───────────────────── */
function ctoGoogleSignIn() {
  const url = HOSTED_UI_DOMAIN + '/oauth2/authorize'
    + '?identity_provider=Google'
    + '&client_id=' + encodeURIComponent(COGNITO_CLIENT_ID)
    + '&response_type=code'
    + '&scope=' + encodeURIComponent('openid email profile')
    + '&redirect_uri=' + encodeURIComponent(OAUTH_REDIRECT);
  window.location.href = url;
}

// Call this on the /dashboard page to finish a Hosted-UI / Google redirect.
async function ctoHandleOAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', COGNITO_CLIENT_ID);
  body.set('code', code);
  body.set('redirect_uri', OAUTH_REDIRECT);
  const res = await fetch(HOSTED_UI_DOMAIN + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.id_token) {
    ctoSetTokens({ IdToken: data.id_token, AccessToken: data.access_token, RefreshToken: data.refresh_token });
    return true;
  }
  return false;
}

function ctoSignOut(redirectTo) {
  ctoClearTokens();
  window.location.replace(redirectTo || '/login');
}

// Gate a private page: bounce to /login when not signed in.
function requireSession(redirectTo) {
  if (!AWS_CONFIGURED) return null;       // don't block local dev before keys are set
  if (!ctoTokenValid()) { window.location.replace(redirectTo || '/login'); return null; }
  return ctoIdToken();
}

function friendlyAuthError(err) {
  const c = (err && (err.code || '')) + '';
  const m = (err && err.message) || 'Something went wrong. Please try again.';
  if (c.indexOf('NotAuthorized') !== -1) return 'Incorrect email or password.';
  if (c.indexOf('UsernameExists') !== -1) return 'An account with this email already exists. Try signing in.';
  if (c.indexOf('UserNotConfirmed') !== -1) return 'Please confirm your email first — check your inbox for the code.';
  if (c.indexOf('InvalidPassword') !== -1) return 'Password must be at least 8 characters with a number and a lowercase letter.';
  if (c.indexOf('CodeMismatch') !== -1) return 'That confirmation code is incorrect.';
  if (c.indexOf('LimitExceeded') !== -1 || c.indexOf('TooManyRequests') !== -1) return 'Too many attempts. Please wait a moment and try again.';
  return m;
}

/* ───────────────────────── resume scan API ──────────────────────── */
// Calls API Gateway -> Lambda -> Bedrock. Returns the analysis text.
async function ctoScanResume(resumeText, jobDescription) {
  if (!AWS_CONFIGURED) throw new Error('AWS is not configured yet (aws-config.js).');
  const res = await fetch(API_BASE_URL + '/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': ctoIdToken() || '',
    },
    body: JSON.stringify({ resume: resumeText, jobDescription: jobDescription || '' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Scan failed');
  return data.analysis;
}
