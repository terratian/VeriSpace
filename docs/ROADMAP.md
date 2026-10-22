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

- Done 2026-10-21: property model (rooms, features, layout), setup wizard, 3D viewer, manager baseline walk, listing derived from feature status.
- Next: maintenance tickets feeding feature status, then SMS touchpoints, geofencing, asset data (6D/7D), real 3D scan.

## Realigned 2026-10-22 (owner's product definition; supersedes the "Next" lists above)
Three modules working as one property-management suite:
1. **VeriSpace Suite (owner/manager).** Populate each property room by room: a panorama of the whole room, a photo of each appliance and consumable, a welcome doc and a checkout doc. No 3D scanning; the 3D box model is optional.
2. **Crew (flip).** The crew's per-room to-do list is derived from what the owner provided and expects. Each task has a preset action type (set in VeriStay) and a photo check ("stand here, take this picture"), geofenced, in the crew's language.
3. **VeriStay (guest).** Check-in and checkout link from the reservation: welcome doc, in-room guides, arrival and departure photos.
Everything lands in the per-room sealed ledger, which is the evidence trail for damage and responsibility.

Build order: (1) owner inventory per room (room panorama, assets, consumables, docs); (2) tasks generated from the inventory with preset action types and a reference "stand here" photo; (3) crew capture screens: camera only, geofence, localization (es, fa, ar, hi, en); (4) VeriStay check-in/checkout polish; (5) owner before/after view and damage report; then SMS, PMS calendar import, maintenance tickets, smart-lock state.
Done and kept: ledger, links, RLS, guides, checklists, readiness, issues and custody, deploy pipeline. De-prioritized: 3D layout editor, floor plan, 3D viewer (kept, optional).

## Module names and flows (2026-10-22)
- **VeriSpace Suite** (owner/manager): builds the property room by room, scans rooms, pins assets, sets required checks.
- **VeriService** (cleaners/crew): its own task-driven flow, not a concierge. Required checks need an in-app, geofenced, time-stamped photo; skipped required checks are reported, and the owner decides pay from the completion report (the app suggests, never pays).
- **VeriStay** (guests): a concierge: easy check-in, mid-stay check-in, checkout; tap an asset pin in the room view for help.
