# Escape from Tarkov Helper

Clean, progression-first EFT helper webapp with:

- Full task explorer (filters, prereq-aware unlocks, objective tracking, needed items)
- Dedicated Kappa dashboard (`kappaRequired` source data from tarkov.dev)
- Constraint-aware weapon builder + save/share + compare
- Optional AI Build Agent (deterministic planner + optional OpenAI interpretation/explanation)
- Flea market lookup + deal finder + watchlist foundation
- Optional Companion Sync (local log watcher -> automatic task progress updates)

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS + lightweight shadcn-style component structure
- NextAuth (credentials)
- PostgreSQL + Prisma
- tarkov.dev GraphQL (`https://api.tarkov.dev/graphql`) as source of truth

## Core Architecture

- `lib/tarkov/client.ts`
  - GraphQL client
  - Retry + rate-limit
  - `limit/offset` pagination helper
- `lib/tarkov/queries.ts`
  - Representative task/item/trader/flea queries
- `lib/tarkov/service.ts`
  - Cached read services (`unstable_cache`)
- `lib/tasks/*`
  - Progress model, unlock logic, Kappa pathing, needed items
- `lib/builds/*`
  - Deterministic planner and AI agent orchestration
- `lib/assets/icon-map.ts`
  - Item icon mapping layer (`itemId -> icon URL`) with DB cache

## Route Map

- `/dashboard`
- `/tasks`
- `/tasks/[id]`
- `/kappa`
- `/kappa/[username]`
- `/builds`
- `/builds/new`
- `/builds/[id]`
- `/flea`
- `/companion`
- `/profile`
- `/auth/login`
- `/auth/register`
- `/credits`

## Environment Variables

Create `.env` (or `.env.local`):

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB"
NEXTAUTH_SECRET="replace-with-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
INVITE_ONLY_MODE="true"
ADMIN_EMAIL="owner@example.com"
ADMIN_PANEL_KEY="replace-with-long-random-admin-key"
INVITE_CODE_PREFIX="THB"
INVITE_CODE_LENGTH="8"

# Optional
OPENAI_API_KEY=""
TARKOV_DEV_ENDPOINT="https://api.tarkov.dev/graphql"
TARKOV_DEV_REQUESTS_PER_SECOND="4"
TARKOV_CACHE_REVALIDATE_SECONDS="900"

# Optional icon source overrides
EFT_ICONS_BASE_URL=""
EFT_ICONS_LICENSE=""
EFT_WIKI_ICON_BASE_URL=""
```

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Generate Prisma client

```bash
npm run prisma:generate
```

Note:
- Prisma CLI reads `.env` by default.
- Next.js runtime reads `.env.local` first.
- Keep `DATABASE_URL` aligned in both files, or export `DATABASE_URL` in shell before running Prisma commands.

3. Create DB schema

```bash
npm run prisma:push
```

4. Initial sync (tasks + items catalog + icon mapping cache)

```bash
npm run db:sync
```

5. Seed invite codes for closed beta (default target: 25 unused)

```bash
npm run invites:seed
```

6. Run dev server

```bash
npm run dev
```

## Available Commands

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run prisma:generate`
- `npm run prisma:push`
- `npm run prisma:studio`
- `npm run db:sync`
- `npm run db:prepare`
- `npm run invites:seed`
- `npm run security:scan`

## Safe Open-Source Release

Before publishing the repository publicly:

1. Rotate production secrets:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `OPENAI_API_KEY` (if used)
   - Companion tokens
2. Keep `.env` and `.env.local` local only (never commit).
3. Run:

```bash
npm run security:scan
```

4. Follow `docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`.
5. Keep `SECURITY.md` and `docs/THREAT_MODEL.md` in sync with implementation.

## Invite-Only Beta

- Registration requires a valid invite code when `INVITE_ONLY_MODE=true`.
- Codes are one-time use and get bound to the user who registered with them.
- Generate/maintain your pool:

```bash
npm run invites:seed
```

Optional flags:

```bash
npm run invites:seed -- --target 25 --prefix THB --length 8
npm run invites:seed -- --reset-unused --target 25
```

## Admin Panel

- Private panel route: `/admin/<ADMIN_PANEL_KEY>`
- Access is allowed only for a signed-in account matching `ADMIN_EMAIL`.
- Controls available:
  - Toggle invite-only mode on/off in real time
  - Generate additional invite codes
  - Review recent invite usage
  - View recent users and which invite they used

## Companion Sync

Companion Sync lets users auto-update task progress from a local background script.

### API Endpoints

- `GET /api/companion/token` (auth required): fetch token status/metadata
- `POST /api/companion/token` (auth required): create/rotate token
- `DELETE /api/companion/token` (auth required): revoke token
- `POST /api/companion/ingest` (token auth): ingest task/objective events

### Windows Agent Download

- `/downloads/tarkov-helper-companion.ps1`
- `/downloads/companion-events-template.json`

### Quick Setup

1. Open `/dashboard` or `/companion` and generate a token.
2. Copy ingest endpoint + token.
3. Run first pass (auto-detect logs for Steam + launcher):

```powershell
.\tarkov-helper-companion.ps1 -ApiBaseUrl "https://your-domain-or-localhost" -CompanionToken "thp_..." -BackfillOnly -BackfillLogLimit 120 -BackfillFlushEveryLogs 20
```

4. If auto-detect fails, pass `-LogsRoot` explicitly.

Steam example:

```powershell
.\tarkov-helper-companion.ps1 -ApiBaseUrl "https://your-domain-or-localhost" -CompanionToken "thp_..." -LogsRoot "C:\Program Files (x86)\Steam\steamapps\common\Escape from Tarkov\build\Logs" -BackfillOnly
```

Launcher example:

```powershell
.\tarkov-helper-companion.ps1 -ApiBaseUrl "https://your-domain-or-localhost" -CompanionToken "thp_..." -LogsRoot "C:\Battlestate Games\EFT (live)\Logs" -BackfillOnly
```

5. Keep script running while playing EFT (remove `-BackfillOnly` for live mode).

Notes:
- Initial sync/backfill depends on logs still present on disk.
- Unknown task IDs/names are skipped safely by ingest API.

## Data Sync Job

`scripts/sync-tarkov.ts`:

- Pulls all tasks from tarkov.dev using pagination
- Pulls item catalog using pagination
- Upserts into `TaskCatalog` and `ItemCatalog`
- Seeds `ItemAsset` mappings for icon lookup/proxy
- Updates `SyncState` metadata

Run it whenever you want fresh catalog snapshots.

## Milestone Coverage

### Milestone 1

- NextAuth credentials auth
- User profile/settings
- Task explorer + detail
- Task and objective progress persistence

### Milestone 2

- Dedicated Kappa dashboard
- Progress bar + remaining + blocked + next 5
- Public share route with privacy control (`/kappa/[username]`)

### Milestone 3

- Constraint-aware weapon builder
- Deterministic build planner
- Save/share builds + build detail + compare

### Milestone 4

- AI Build Agent endpoint + UI integration
- Flea market search + deal finder + watchlist API/UI

## Compliance / Credits

See `/credits` in-app.

- Data provider: tarkov.dev GraphQL API
- Icon sources: proxied tarkov.dev assets by default, optional custom icon base URLs
- Always verify external icon licenses/TOS before production deployment

## Notes

- Task virtualization uses `@tanstack/react-virtual` (lint warning from React Compiler compatibility is non-blocking).
- AI mode is optional and requires `OPENAI_API_KEY`.
