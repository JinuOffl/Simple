# 006 — Billing Provider Selection

**Status:** DECIDED (defer vendor choice)  
**Date:** 2026-11-10

## Context
Simple needs subscription monetization: free / pro / group plans. Different distribution
channels have different requirements:

- **Google Play (Android APK):** requires Google Play Billing API for in-app digital
  subscriptions by Google Play policy. Cannot use Stripe for subscriptions inside a Play-
  distributed APK without risk of policy violation.
- **Web (PWA or direct APK sideload):** can use Stripe or any payment processor.
- **Unified approach:** RevenueCat or similar can proxy Play Billing, Stripe, and App Store
  Billing behind a single API.

## Options
1. **Google Play Billing only** — Android-native, required for Play distribution, but no web.
2. **Stripe only** — works for web, but violates Play policy if users subscribe inside the APK.
3. **RevenueCat** — unified SDK; handles Play Billing on Android, Stripe on web, App Store
   on iOS. Adds a dependency and revenue share.
4. **Build `EntitlementProvider` interface + dev/manual provider first, choose vendor later.**

## Decision
**Option 4.** Ship Phase 7 with a `DevEntitlementProvider` that reads from a config table
(manual upgrades by admin). The `billing-webhook` function accepts a provider-agnostic payload.
No vendor SDK is integrated until the distribution channel is finalized.

## Consequences
- `entitlements` table: `provider text, provider_ref text` columns are reserved but unused.
- When ready: implement a concrete `EntitlementProvider` for the chosen vendor.
- Note: if distributed via Google Play, Play Billing is non-optional for digital subscriptions.
- Note: RevenueCat is a strong default if multi-channel is needed; evaluate at that time.

