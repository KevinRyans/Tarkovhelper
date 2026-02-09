# Threat Model (Beta)

## Assets to Protect

- User accounts and session integrity
- Task/build progress data
- Companion ingestion tokens
- Admin controls (invite mode, code generation)
- Infrastructure secrets (DB URL, auth secret, API keys)

## Main Entry Points

- Auth routes (`/api/auth/*`, `/api/register`)
- Companion routes (`/api/companion/token`, `/api/companion/ingest`)
- Admin panel route (`/admin/[panelKey]`) + server actions
- Public read APIs (`/api/search`, `/api/flea`, `/api/icons/[itemId]`)

## Trust Boundaries

- Browser client is untrusted
- Companion script runs on user machine (semi-trusted input source)
- Server-side API and DB are trusted execution zones

## Primary Risks and Mitigations

1. Token leakage (companion/admin/session)
- Mitigation: short display in UI, rotate/revoke token support, do not log secrets, strong random values.

2. Unauthorized admin access
- Mitigation: require both admin email session check and secret route key.

3. Abuse of ingest endpoint
- Mitigation: token auth, request validation, rate limiting at app/edge/proxy.

4. Secret exposure in repository
- Mitigation: keep env files untracked, use `npm run security:scan`, rotate leaked secrets immediately.

5. Bad or malformed log payloads
- Mitigation: strict schema validation, unknown IDs skipped safely, idempotent progress upserts.

## Out of Scope

- Game anti-cheat internals
- Any process-level game instrumentation
