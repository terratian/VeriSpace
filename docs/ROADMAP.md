# VeriSpace Roadmap

## Phase 1 — Proof of Concept (done when the demo site is live)
- Repository, Project Bible, `CLAUDE.md`, brand tokens
- Demo landing page (`index.html`) on GitHub Pages
- Operating budget and revenue model documented

## Phase 2 — MVP Core Build (weeks 1–2)
- [x] Initial migration: append-only Merkle ledger, per-room sequencing, chain verifier (tested on Postgres 16, incl. concurrency)
- [x] Capability links (signed, time-windowed, property/room scoped) and link creation API
- [x] Ledger append/verify API with role-based authorization
- [ ] SMS/email delivery of links (Twilio/Resend)
- [x] Manager sign-in (Google OAuth + email link via Supabase) and a basic dashboard: list/add properties and rooms
- [x] Row Level Security policies (owner-scoped; ledger read-only for owners), tested on Postgres 16
- [ ] Dashboard: reservations, create crew/guest links, view and verify a room's ledger

## Phase 3 — Spatial & Vision Engine (weeks 3–4)
- Three.js / WebGPU room viewport
- [x] Client-side SHA-256 frame hasher (`frameHasher.ts`)
- [x] Snap-to-verify capture form connected to the ledger API (hash only; raw frame storage in R2 still to do)
- Vision worker for arrival vs. checkout comparison

## Later
- LiDAR-device scan support alongside monocular/WebXR capture
- iCal sync for reservation windows
- Dispute evidence export

*Timelines are targets from the initial planning session, not commitments.*

## Added 2026-10-21
- Done: property guide builder, crew task checklists, guest guide, turnover readiness, light theme, dashboard metrics and 14-day calendar.
- Next, in order: SMS touchpoints and guest guide delivery (design: `docs/design/sms-plivo.md`), assets and maintenance module, geofencing, baseline scan, 3D viewport.
- Later: staging and amenity standards, direct booking and payments, local recommendations.
