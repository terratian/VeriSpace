# CLAUDE.md — VeriSpace Spatial STR Ledger

## Project Overview
VeriSpace is a Next.js PWA implementing an append-only spatial condition ledger with Merkle nonce-chaining, Three.js 3D/WebGPU room viewports, and Obsidian/Mint branding (`#0B0C10` and `#66FCF1`).

Read `MASTER_PROJECT_SPEC.md` first, then `docs/ROADMAP.md`.

## Naming
The product name is **VeriSpace** (not "VerisSpace" or "Verispace" in prose). The GitHub repo is `terratian/VeriSpace`.

## Core Invariants
1. **Append-Only Ledger:** `room_state_ledger` is immutable via PostgreSQL triggers that raise on UPDATE, DELETE, and TRUNCATE. Never write any of those against it.
2. **AirCover Compliance:** Unedited raw frames hashed via Web Crypto `SHA-256` before any processing.
3. **Role-Based Auth:** Manager (OAuth), Crew (SMS Passkey), Guest (Ephemeral JWT).

## Brand Tokens
- Obsidian `#0B0C10`, Slate `#1F2833`, Light Gray `#C5C6C7`, Mint `#66FCF1`

## Repo Layout
- `src/app` — Next.js App Router pages and API routes (`/api/ledger`, `/api/ledger/verify`, `/api/guest-links`, `/crew/[token]`, `/guest/[token]`, `/login`, `/auth/callback`, `/auth/signout`, `/dashboard`)
- `src/proxy.ts` — Next 16 proxy (renamed from middleware); refreshes the Supabase session for `/dashboard` and `/login` only
- `src/lib` — `ledger.ts` (authorization + append/verify), `capability.ts` (signed magic links), `frameHasher.ts` (client SHA-256), `supabase/server.ts` (service role, bypasses RLS), `supabase/ssr-server.ts` (acts as the signed-in user, RLS applies), `supabase/browser.ts`
- `src/components` — `CaptureForm` (snap-to-verify), `LinkGate`
- `supabase/migrations` — SQL migrations, timestamp-prefixed
- `supabase/tests/` — `ledger_test.sh` and `rls_test.sh` (`npm run test:db`; need a scratch Postgres via PGHOST/PGPORT/PGUSER; RLS test stubs Supabase's `auth.uid()`)
- `docs/` — roadmap and budget
- `index.html` — standalone demo landing page (GitHub Pages)

## Commands
- `npm test` — unit tests (vitest)
- `npm run typecheck`, `npm run build`
- `npm run test:db` — ledger migration tests against a scratch Postgres (creates and drops `vs_ledger_test`)

## Ledger rules learned the hard way
- The chain is ordered by per-room `seq`, assigned under an advisory lock. Never order or chain by `id`: identity ids are issued before the lock and interleave under concurrency.
- Hash input lives in one SQL function, `ledger_row_digest`, shared by the insert trigger and `verify_room_chain`. Change it only via a new migration.

## Supabase client rules
- Manager-facing pages and server actions use `createSessionClient` (publishable key + cookies) so RLS enforces ownership. Use `serviceClient()` only in the API after authorizing the caller yourself.
- `NEXT_PUBLIC_*` variables must be referenced literally (`process.env.NEXT_PUBLIC_X`), never via `process.env[name]`, or they are not inlined into the browser bundle.
- The proxy is a convenience, not the security boundary: pages and routes still call `getUser()` themselves.
- Ledger writes are API-only (no insert policy for `authenticated`).
