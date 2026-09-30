# Mini API

Express and TypeScript API for TikTok Minis silent login. Its organization follows `p2v-voting-api`: route modules delegate to application handlers, which call focused services and Mongoose models.

## Configuration

Copy `env.example` to `.env`, set the TikTok Minis client key and secret, and configure a reachable MongoDB database. Generate `MINI_API_SESSION_SECRET` with a cryptographically random value. `TIKTOK_TOKEN_ENCRYPTION_KEY` must be a base64-encoded 32-byte key; for example, generate one locally with `openssl rand -base64 32` and keep it in the deployment secret store. Never commit `.env` or expose the TikTok client secret to the web app.

The API reflects each request's `Origin` for CORS because a TikTok Minis runtime may use an origin that is not a stable developer-controlled domain. Authentication uses bearer tokens, not cookies, and no credentialed CORS is enabled. No `MINI_WEB_ORIGIN` setting is needed.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

The API listens on port `3001` by default. `GET /healthCheck` reports service health. `POST /auth/silent-login` accepts `{ "code": "..." }`, exchanges the one-time code with TikTok, stores encrypted provider tokens in MongoDB by `open_id`, and returns a short-lived API session token plus TikTok's granted scopes. The web app requests `user.info.basic,user.info.profile` only after the user chooses to connect their profile. `POST /auth/profile/authorize` exchanges the consent code for an updated TikTok token, verifies that it belongs to the signed-in account and includes both scopes, then fetches and caches `display_name`, `avatar_url`, and `username`. TikTok requires `user.info.profile` for `username`. `GET /auth/profile` returns the cached profile and whether the username scope is granted. Add and obtain approval for `user.info.profile` in the TikTok Developer Portal. `POST /auth/refresh` accepts the session token as a Bearer credential and refreshes TikTok credentials when the access token is within 30 minutes of expiry.

The web app can target a different API origin with `VITE_MINI_API_URL`. Provider access and refresh tokens are never returned to the browser.

TikTok Minis client failures are submitted to `POST /auth/client-error` and stored in MongoDB's `ErrorLogs` collection alongside backend silent-login and refresh failures. Inspect `functionName`, `errorCode`, `errorResponse`, and `parameters.stage` to identify whether the failure occurred in the Minis SDK, the browser-to-API request, or the TikTok OAuth exchange. Authorization codes and tokens are not included in the client diagnostic payload.

## Deploy to Vercel

Create a Vercel project for this API and set its **Root Directory** to `mini-api` (or the repository root if this repository contains only the API). Vercel detects the exported Express app in `index.ts`; no custom Vercel build configuration is required. Keep the `npm run dev` command for local development; Vercel invokes the Express app as a function.

Add these environment variables to the Vercel project for each environment you deploy:

- `MONGODB_URI`
- `TIKTOK_MINIS_CLIENT_KEY`
- `TIKTOK_MINIS_CLIENT_SECRET`
- `MINI_API_SESSION_SECRET`
- `TIKTOK_TOKEN_ENCRYPTION_KEY`

Configure the MongoDB provider to accept connections from Vercel, and set `VITE_MINI_API_URL` in the frontend Vercel project to this API deployment's origin. The app reuses its MongoDB connection across warm function instances and connects on demand after cold starts.
