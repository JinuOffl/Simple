# Simple v2 — Public Beta Launch Notes

> **Target Release:** Public Beta (Web-First PWA)  
> **Date:** 2026-11-19  
> **Status:** Code Hardened & Verified — Ready for Deployment Operations

---

## 1. Environment Variables Specification

The system cleanly separates client-side environment variables (`import.meta.env`) from server-side Supabase Edge Function secrets (`Deno.env`).

### Client Variables (Web Frontend)

| Variable | Required | Production Value | Purpose |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | **Yes** | `https://<project-ref>.supabase.co` | Base URL of the production Supabase instance. |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | `<production-anon-key>` | Public anonymous key for client auth and RLS-scoped queries. |
| `VITE_CAPTCHA_SITEKEY` | *Optional* | `0x4AAAAAA...` (Cloudflare Turnstile) | Turnstile site key for guest CAPTCHA abuse protection. If omitted, anonymous sign-in proceeds without CAPTCHA. |
| `VITE_GROQ_API_KEY` | **No** | *Leave unset* | Dev-only fallback key. **Must NOT be set in production builds** (audited by `audit:dist`). |
| `VITE_LOCAL_GENERATE_APP_URL` | **No** | *Leave unset* | Dev-only local proxy override. |
| `VITE_LOCAL_MCP_ACTION_URL` | **No** | *Leave unset* | Dev-only local proxy override. |
| `VITE_LOCAL_MANAGE_CONNECTION_URL`| **No** | *Leave unset* | Dev-only local proxy override. |

### Server Secrets (Supabase Edge Functions)

Set these via `supabase secrets set <KEY>=<VALUE>` on the target Supabase project.

| Variable | Required | Production Value | Purpose |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | **Yes** | `https://<project-ref>.supabase.co` | System URL injected by Supabase runtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | `<service-role-key>` | Service role key for admin tasks (rate-limit ledger reads, credit deductions). |
| `GROQ_API_KEY` | **Yes** | `gsk_...` | Primary LLM inference API key for tool generation and conversation loop. |
| `CONNECTION_ENCRYPTION_KEY` | **Yes** | `64-character hex string` (32 bytes) | AES-GCM-256 master key for encrypting user connector secrets & BYOK credentials at rest. |
| `BILLING_WEBHOOK_SECRET` | **Yes** | `whsec_...` | Webhook signing secret from Stripe / LemonSqueezy for credit grants and plan changes. |
| `GENERATION_DISABLED` | *Optional*| `"false"` | Global operational kill switch. Set to `"true"` to return HTTP 503 maintenance mode. |
| `GROQ_FALLBACK_API_KEY` | *Optional*| `gsk_...` | Optional secondary key for automatic LLM fallback failover. |
| `MCP_CONNECTOR_URLS` | *Optional*| JSON map of vetted servers | Allowlisted MCP server URLs for external tool integrations. |

> [!CAUTION]
> **Production Guard (`prodGuard.ts`):**  
> When `DENO_DEPLOYMENT_ID` is present (Supabase production), the server checks all dev-bypass flags. If any of `GENERATION_LOCAL_DEV_OPEN`, `MCP_ALLOW_LOCAL_DEV_LOOPBACK`, `API_FETCH_LOCAL_DEV_OPEN`, `INVITES_LOCAL_DEV_OPEN`, `BYOK_LOCAL_DEV_OPEN`, `BILLING_LOCAL_DEV_OPEN`, or `LLM_ACTION_LOCAL_DEV_OPEN` are set to `"true"`, Edge Functions fail-closed immediately with HTTP 500 (`"Server misconfigured"`).

---

## 2. Known Limitations & Platform Compatibility

1. **Web Bluetooth API (BLE):**
   - **Supported:** Google Chrome (desktop & Android), Microsoft Edge, Opera.
   - **Unsupported:** iOS Safari, iPadOS Safari, Mozilla Firefox (Web Bluetooth is intentionally disabled by Apple and Mozilla).
   - Tools utilizing BLE heart-rate monitors or sensors display a clear fallback notice when `navigator.bluetooth` is unavailable.

2. **Web Speech API (Voice Input & Recognition):**
   - **Supported:** Google Chrome, Chromium-based browsers, Android Chrome.
   - **Unsupported:** iOS Safari (intermittent permission restrictions), Firefox.
   - The `MicRecorder` component falls back gracefully to standard text entry when voice recognition is unavailable.

3. **Web-First Public Beta Scope:**
   - This release targets the Progressive Web App (PWA) on modern desktop and mobile browsers.
   - Native Android APK and iOS IPA packaging via Capacitor are not part of this public beta wave and remain for a subsequent release.

4. **Session Persistence in Guest Mode:**
   - Guest tools and data are strictly stored locally in the browser's `localStorage` (`simple_guest_apps`, `simple_guest_data_*`).
   - Clearing site data or opening in Private/Incognito windows does not preserve guest tools across sessions. Users are prompted on Home to sign in via email OTP to permanently sync tools to Supabase.

---

## 3. Manual Smoke-Test Script (12 Steps)

Follow these steps in a standard Chromium browser (Chrome or Edge) against the deployed build:

### Step 1: Unauthenticated Landing & PWA Installability
1. Open the root URL (`#/`).
2. Verify the monochrome Nothing OS layout: dot-matrix wordmark `"Simple."`, plan badge `"GUEST"`, and the account menu icon.
3. Verify the browser address bar presents the PWA install icon (or "Add to Home Screen" on mobile). Check that `manifest.webmanifest` and `favicon.svg` load without 404s.

### Step 2: Instant Template Cloning (Zero LLM)
1. On the empty Home screen, inspect the 6 starter templates: Habit Heatmap, Pomodoro Timer, Tally Counter, World Clock, London Weather, and Currency Converter.
2. Click **Habit Heatmap**.
3. Verify that navigation occurs immediately to `#/app/<id>` without an LLM invocation or network spinner.
4. Verify the 14-day habit grid renders with rows for Workout, Reading, and Water.

### Step 3: Local Storage Persistence (Guest Mode)
1. Toggle several day squares on the Habit Heatmap (confirm they turn solid white).
2. Refresh the browser page (`F5` or `Ctrl+R`).
3. Verify all toggled states persist from local storage.
4. Navigate back to Home (`#/`) and verify the Habit Heatmap tile displays under active tools.

### Step 4: Deterministic Local Compute (Counter / Pomodoro)
1. From Home, click the **Templates** button in the header.
2. Select the **Tally Counter** starter template.
3. Click the `+1` button several times; verify the count increments instantly without any network call.
4. Click **Reset**; verify the count resets to `0`.

### Step 5: Email OTP Authentication Flow
1. Click the top-right account menu button and select **Sign in** (or navigate to `#/auth`).
2. Enter a valid email address and click **Send verification code**.
3. Verify the screen transitions to the 6-digit numeric input with a 30-second countdown on the resend button.
4. Enter the 6-digit OTP code received via email.
5. Verify automatic sign-in, redirect to Home (`#/`), and observe the plan badge change from `"GUEST"` to `"FREE"`.

### Step 6: Account & Plan Usage Modal
1. Click the account menu button and select **Plan & usage** (`#/usage`).
2. Verify:
   - Current plan shows "Free Plan" with credit allowance (e.g., 20 credits/mo).
   - Active tool count vs plan limit (e.g., 3 active tools).
   - "Sleeping tools" count is formatted correctly (e.g., "0 sleeping tools").
   - There are **no self-serve payment upgrade buttons** (free tier during beta).

### Step 7: Natural Language Tool Generation
1. Click the floating `+` button on Home to open the Builder (`#/build`).
2. In the prompt bar, enter: `A study timer with 45 minutes and a topics checklist`.
3. Click the send arrow button.
4. Verify:
   - Builder displays the skeleton loading state while generating.
   - The generated tool renders a 45-minute countdown timer and a checklist component.
   - Status bar reports "Ready" (manifest valid v2).

### Step 8: Save-Time Consent Dialog
1. In the Builder, click the top-right **Save** button.
2. Because the tool uses local storage only (no external connectors or high-risk permissions), verify it saves immediately and redirects to Home.
3. Test a tool requiring external APIs (e.g. `Show London weather`): click Save and verify the explicit permission consent dialog lists the external API domain before committing.

### Step 9: App Runner & Live Tile Synchronization
1. From Home, click the newly created study tool tile.
2. In the App Runner (`#/app/<id>`), add a topic to the checklist and check it off.
3. Return to Home.
4. Verify the live tool tile reflects the updated state (last updated timestamp and summary).

### Step 10: Role-Based Controls & Sharing / Invites
1. Open the study tool in App Runner (`#/app/<id>`).
2. Because you are the creator, verify the header displays both **Share** and **Edit** buttons.
3. Click **Share**, select role "Editor", and click **Generate invite**.
4. Copy the invite link (`#/join/<code>`).
5. Open an Incognito window, paste the invite link, sign in with a different test account, and accept the invite.
6. Verify the accepted tool displays in the invited user's Home library, but as an editor, they can run the tool while manifest edit privileges remain restricted to the owner.

### Step 11: Abuse Protection, Rate Limiting & Kill Switch
1. Test rate limit: Issue 7 rapid tool generation requests within 60 seconds. Verify the 7th request returns a friendly dismissible banner: `"Too many requests. Wait a minute."` (HTTP 429).
2. Test kill switch: Set `GENERATION_DISABLED="true"` in edge function environment. Attempt a generation. Verify user-facing message: `"Generation is temporarily disabled. Please try again later."` (HTTP 503).

### Step 12: Offline App Shell & Service Worker
1. Open Chrome DevTools (`F12`), switch to the **Application** tab, and verify `sw.js` is registered and active under **Service Workers**.
2. Switch DevTools to the **Network** tab and toggle the throttling dropdown to **Offline**.
3. Reload the page (`Ctrl+R`).
4. Verify the app shell, fonts, and cached starter templates load completely without the browser "No internet" screen.
5. Re-enable network connectivity.

---

## 4. Verification Exclusions & Launch Readiness

- **Real Live-LLM Token Evals:** The scripted evaluation suite (`npm run evals`) validates schema conformances, deterministic heuristics, repair chains, and template matching using mocked and local synthetic fixtures. Real Groq production API inference latency and token quality depend on live provider availability and should be smoke-tested post-deployment using step 7 above.
- **Payment Gateway Webhooks:** Webhook processing (`billing-webhook`) is unit- and integration-tested with synthetic Stripe/LemonSqueezy payloads. Live payment gateway endpoints should be verified during staging before enabling paid tier upgrades.
- **Production Supabase Migrations:** Database migrations `001_initial_schema.sql` through `006_realtime.sql` have been verified on local PostgreSQL/PGlite environments; target production database execution remains an operational deployment step as detailed in [RELEASE_CHECKLIST.md](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/docs/RELEASE_CHECKLIST.md).
