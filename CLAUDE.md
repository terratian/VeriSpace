# CLAUDE.md — VerisSpace Spatial STR Ledger

## Project Overview
VerisSpace is a Next.js PWA implementing an append-only spatial condition ledger with Merkle nonce-chaining, Three.js 3D/WebGPU room viewports, and Obsidian/Mint branding (`#0B0C10` and `#66FCF1`).

## Core Invariants
1. **Append-Only Ledger:** `room_state_ledger` is immutable via PostgreSQL rules.
2. **AirCover Compliance:** Unedited raw frames hashed via Web Crypto `SHA-256`.
3. **Role-Based Auth:** Manager (OAuth), Crew (SMS Passkey), Guest (Ephemeral JWT).
