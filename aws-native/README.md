<!--
  Created by GuntherCloudSolutions
  Last updated: 2026-06-28
-->
# CloseTheOffer — AWS-Native Migration

This folder contains everything needed to run CloseTheOffer on **AWS-native services
only** — replacing Vercel (hosting), Supabase (auth), and the direct Anthropic API
(resume AI) with AWS equivalents.

## Service mapping

| Today | AWS-native replacement | Status |
|-------|------------------------|--------|
| Vercel hosting + `vercel.json` clean URLs | **S3** (private) + **CloudFront** (OAC) + **CloudFront Function** for routing | ✅ replaced |
| Supabase email/password + Google login | **Amazon Cognito** User Pool + Hosted UI + Google federated IdP | ✅ replaced |
| Anthropic API (`api.anthropic.com`) for resume scan | **Amazon Bedrock** (Claude) behind **API Gateway (HTTP API) + Lambda** | ✅ replaced |
| `localStorage` for resume / pipeline | **DynamoDB** (per-user, keyed by Cognito `sub`) via API + Lambda | ✅ added |
| pdf.js / mammoth from cdnjs | self-hosted in the S3 bucket under `/vendor/` | ✅ replaced |
| **RapidAPI JSearch** (job listings) | *no AWS service supplies job-board data* | ⚠️ stays external |
| **Google Gmail / Calendar** sync | *that is Google's data; AWS cannot read it* | ⚠️ stays external |

The two ⚠️ items are kept as external calls because AWS has no equivalent. Everything
else runs on AWS.

## Architecture

```
                       ┌──────────────────────────────────────────┐
   Browser  ──HTTPS──▶ │ CloudFront (TLS, caching, routing fn)     │
                       │   origin: S3 (private, OAC)               │  static site
                       └──────────────────────────────────────────┘
        │
        │  sign in / sign up
        ▼
   ┌──────────────────────┐     federated      ┌───────────────┐
   │ Amazon Cognito        │◀──── Google IdP ──▶│ Google OAuth  │
   │ User Pool + Hosted UI │   (optional)        └───────────────┘
   └──────────────────────┘
        │ JWT (id/access token)
        ▼
   ┌──────────────────────────────┐   InvokeModel   ┌──────────────┐
   │ API Gateway (HTTP API)        │───────────────▶│ Amazon       │
   │  JWT authorizer (Cognito)     │   Lambda        │ Bedrock      │  resume AI
   │   /scan   → resume-scan λ ─────┘                 │ (Claude)     │
   │   /data   → data λ ───────────┐                 └──────────────┘
   └───────────────────────────────┘
                                   ▼
                            ┌──────────────┐
                            │ DynamoDB      │  per-user resume / pipeline
                            └──────────────┘
```

## What's in this folder

```
aws-native/
├── README.md                       ← this file
├── infrastructure/
│   ├── backend.yaml                ← Cognito + HTTP API + Lambdas + DynamoDB (SAM)
│   └── hosting.yaml                ← S3 + CloudFront + routing function (CloudFormation)
├── src/
│   ├── resume-scan/index.mjs       ← Lambda: calls Bedrock Claude for the resume scan
│   └── data/index.mjs              ← Lambda: DynamoDB get/put for the signed-in user
├── hosting/
│   └── cloudfront-routing.js       ← CloudFront Function (replaces vercel.json routing)
├── frontend/
│   └── aws-config.js               ← browser config + Cognito/API helpers (replaces supabase-config.js)
└── deploy.sh                        ← one-shot build + deploy commands
```

## Prerequisites (one time)

1. An **AWS account** and the **AWS CLI** + **AWS SAM CLI** installed and configured
   (`aws configure`). Use a region where **Bedrock** is available, e.g. `us-east-1`.
2. **Enable Bedrock model access**: AWS Console → Bedrock → *Model access* → request access
   to the Anthropic Claude model you want (e.g. *Claude 3.5 Haiku*). This is required once.
3. (Optional) The **Google OAuth Client ID + secret** if you want "Continue with Google"
   in Cognito — the same one already created in Google Cloud. Add Cognito's Hosted-UI
   callback URL to that Google client's authorized redirect URIs.

## Deploy (high level — see `deploy.sh` for exact commands)

1. **Backend**: `sam build && sam deploy --guided -t infrastructure/backend.yaml`
   → outputs the Cognito User Pool ID, App Client ID, Hosted UI domain, and API base URL.
2. Paste those outputs into **`frontend/aws-config.js`** (and copy that file into the site
   as `aws-config.js`, replacing `supabase-config.js`).
3. **Hosting**: deploy `infrastructure/hosting.yaml` (creates the S3 bucket + CloudFront).
4. **Upload the site**: `aws s3 sync` the site files (and `/vendor/` libs) to the bucket,
   then `cloudfront create-invalidation`.

## Cost (rough, low traffic)

All services are pay-per-use and effectively free at low volume:
- **Cognito**: free up to 50,000 monthly active users.
- **CloudFront + S3**: pennies for a small static site (free-tier eligible).
- **Lambda + API Gateway**: free tier covers light use.
- **DynamoDB**: on-demand; free tier covers light use.
- **Bedrock**: pay per token, same idea as the Anthropic API — only when a resume is scanned.

## Frontend changes required (summary)

- Replace `supabase-config.js` with `frontend/aws-config.js` and update the `<script>` tag.
- `login.html`: swap `supabase.auth.signUp / signInWithPassword / signInWithOAuth` for the
  Cognito helpers in `aws-config.js` (`ctoSignUp`, `ctoSignIn`, `ctoGoogleSignIn`).
- `app.html` resume scan: change the `fetch('https://api.anthropic.com/...')` call to
  `fetch(AWS.apiBase + '/scan', { headers:{ Authorization: idToken } , ... })`.
- Remove the `vercel.json` routing — it's replaced by `hosting/cloudfront-routing.js`.
- Job search (RapidAPI) and Gmail/Calendar (Google) code is unchanged — those stay external.

See each file's header comment for specifics.
