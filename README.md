# Simple

Simple is a personal AI micro-tool platform. Describe an everyday utility or workflow in natural language, and Simple compiles it into a secure, validated declarative JSON manifest (`ManifestV2`) executed instantly through sandboxed UI components, deterministic local actions, and secured external connectors.

Styled with a tactile, monochrome Nothing OS aesthetic.

---

## Features

- **Prompt to Tool**: Natural language orchestrator compiles requests into sandboxed declarative UI manifests.
- **Instant Starter Templates**: Ready-to-use offline mini-tools (Habit Heatmap, Pomodoro Timer, Tally Counter, World Clock, Weather, Currency Converter).
- **Hybrid Guest Mode**: Try immediately with zero sign-up using on-device local storage, or sign in via email OTP.
- **Hardened Architecture**: SSRF-safe MCP and API fetch proxy, sliding-window rate limiting, cryptographic token storage via AES-GCM-256, and strict input validation.
- **PWA & Offline Ready**: Service Worker caching for instant app shell loads, mobile viewport support with safe-area insets.

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
# Frontend (.env)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_CAPTCHA_SITEKEY=<optional-cloudflare-turnstile-sitekey>
VITE_ERROR_ENDPOINT=<optional-telemetry-endpoint>

# Build Environment Validation
# Production builds enforce that VITE_SUPABASE_URL (https://) and VITE_SUPABASE_ANON_KEY are present.
# Secret keys (GROQ_API_KEY, SUPABASE_SERVICE_ROLE_KEY) are prohibited in frontend build environments.
# To bypass environment validation in CI or offline test builds, pass: CI_SKIP_ENV_CHECK=1

# Backend Edge Functions (Supabase Secrets / .env)
GROQ_API_KEY=<groq-api-key>
CONNECTION_ENCRYPTION_KEY=<32-byte-hex-secret>
BILLING_WEBHOOK_SECRET=<webhook-secret>
GENERATION_DISABLED=false
```

---

## Scripts

```bash
# Development server
npm run dev

# Type check
npx tsc -b

# Fast linter (Oxlint)
npm run lint

# Vitest test suite (React components & orchestrator)
npm test

# Deno edge functions test suite
npm run test:edge

# Scripted golden prompts evals
npm run evals

# Production build
npm run build
```

---

## Deployment Steps

1. **Database Migrations**: Apply SQL migrations in order (`supabase/migrations/001` through `006`).
2. **Edge Functions**: Deploy functions to Supabase (`supabase functions deploy`).
3. **Secrets**: Set `CONNECTION_ENCRYPTION_KEY`, `GROQ_API_KEY`, and `BILLING_WEBHOOK_SECRET` in Supabase vault/secrets.
4. **Web Build**: Run `npm run build` and deploy the output in `dist/` to any static web hosting (Vercel, Netlify, Cloudflare Pages).
