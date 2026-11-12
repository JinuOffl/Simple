# ADR 009: Multiplayer Invites, Role Permissions, and Shared Collections

**Status:** Accepted (Phase 6 — Multiplayer Architecture)

## Context
Simple v2 introduces multiplayer capabilities allowing users to collaborate on micro-apps. Key requirements include:
1. Sharing apps via invite links with configurable roles (`editor` vs `viewer`), expiration timestamps, and usage limits.
2. Realtime data synchronization across concurrent active users.
3. Strict role-based permissions: viewers must never be allowed to edit app manifests, update `app_data`, or write to `collection_records`.
4. Clear adherence to architectural constraints: no claims of end-to-end encryption; all invite generation and membership changes handled securely via service-role Edge Functions or RLS-protected tables.

## Options Considered

### 1. Direct Client-Side Writes to `app_members` and `app_invites`
- *Approach:* Expose `app_invites` and `app_members` table directly to authenticated clients with permissive RLS policies.
- *Rejected:* Increases attack surface for race conditions when checking invite limits (`max_uses`, `expires_at`), requires giving clients insert rights to `app_members`, and risks unauthorized invite code enumeration.

### 2. Service-Role Edge Function (`invites`) + Database RLS Enforcement
- *Approach:*
  - An atomic Edge Function (`invites`) handles `create`, `accept`, `get_info`, `list_members`, and `remove_member` operations using service-role credentials with strict caller authorization.
  - An unauthenticated preview endpoint (`op: "get_info"`) returns sanitized app metadata (icon, name, description, role) and validation flags (`expired`, `exhausted`) for invite preview cards without exposing sensitive schema data.
  - Postgres RLS in `supabase/migrations/002_v2_schema.sql` enforces table-level boundaries (`is_app_member`, `has_app_role`):
    - `apps update owner or editor`: viewers cannot modify the app manifest.
    - `app_data insert/update/delete editor`: viewers cannot modify app state.
    - `collection_records insert/update editor`: viewers cannot insert or update records.
    - `collection_records select member`: users can read their own records or shared records (`is_shared = true`).
  - Concurrent Realtime sync connects to Supabase Realtime channels filtered by `app_id=eq.${id}` on `app_data` and dispatches `simple:collection_records_changed` events for local UI reactivity.

## Decision
Adopt Option 2:
- Edge Function `invites` in `supabase/functions/invites/handler.ts`.
- Postgres RLS policies in `002_v2_schema.sql` as the primary defense boundary.
- Frontend components `ShareModal.tsx` and `InviteJoinScreen.tsx` for collaboration management and redemption.
- Client-side defense-in-depth: `AppRunnerScreen.tsx` hides the edit button for viewers, disables write operations, and only displays share link creation to the app owner.

## Consequences
- Invites can be created only by the app owner; editors and viewers can inspect member lists, but cannot generate new invites or remove members.
- Concurrent edits to `app_data` propagate immediately over Supabase Realtime postgres_changes channels.
- Viewers attempting any write operation (manifest edit, app_data upsert, or collection record insertion) are rejected at both the UI layer and Postgres RLS layer.
- Transparency: simple micro-apps do not implement end-to-end encryption; all data in transit is TLS-encrypted and persisted in Supabase with Postgres RLS.
