# CLAUDE.md — VeriSpace Spatial STR Ledger

## Project Overview
VeriSpace is a Next.js PWA implementing an append-only spatial condition ledger with Merkle nonce-chaining, Three.js 3D/WebGPU room viewports, and Obsidian/Mint branding (`#0B0C10` and `#66FCF1`).

Read `MASTER_PROJECT_SPEC.md` first, then `docs/ROADMAP.md`.

## Naming
The product name is **VeriSpace** (not "VerisSpace" or "Verispace" in prose). The GitHub repo is `terratian/VeriSpace`.

## Core Invariants
1. **Append-Only Ledger:** `room_state_ledger` is immutable via PostgreSQL rules. Never write an UPDATE or DELETE against it.
2. **AirCover Compliance:** Unedited raw frames hashed via Web Crypto `SHA-256` before any processing.
3. **Role-Based Auth:** Manager (OAuth), Crew (SMS Passkey), Guest (Ephemeral JWT).

## Brand Tokens
- Obsidian `#0B0C10`, Slate `#1F2833`, Light Gray `#C5C6C7`, Mint `#66FCF1`

## Repo Layout
- `src/app`, `src/components`, `src/lib`, `src/types` — Next.js app (not yet scaffolded)
- `supabase/migrations` — SQL migrations, timestamp-prefixed
- `docs/` — roadmap and budget
- `index.html` — standalone demo landing page (GitHub Pages)
