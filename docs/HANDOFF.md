# VeriSpace handoff

Everything needed to continue this project in any editor, IDE, or AI tool. Read `CLAUDE.md` for the architecture and the rules that must not be broken, and `docs/ROADMAP.md` for the plan.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev -- -p 3030
```

Fill `.env.local`:

| Variable | Where it comes from |
|----------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase, Project Settings, API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, the secret key. Server only. |
| `CAPABILITY_SECRET` | `openssl rand -base64 48` |
| `APP_ORIGIN` | Optional. Set it to a LAN or tunnel address when testing links on a phone. |
| Storage variables | See `.env.example` and `docs/decisions/0001-photo-storage.md` |

Apply every file in `supabase/migrations/` to the Supabase project in filename order. Check that the last one, `20261020000000_reservation_details.sql`, has been applied. Crew and guest links need it.

## What is verified

- Typecheck is clean, 100 unit tests pass (`npm test`), and `npm run build` succeeds.
- The ledger and Row Level Security SQL pass on a scratch Postgres 16 (`npm run test:db`). The reservations test (`supabase/tests/reservations_test.sh`) was written but not run after the last change.
- In a headless browser with a fake camera: rooms list, open a room, "Start cleaning" sends a `clean_start` ledger event, the live camera opens, capture works, and the review screen shows the photo's SHA-256, size, and note box.
- Manager sign-in by email link works against the real Supabase project (tested by the owner).

## Not verified yet

1. Tapping "Record photo": the order must be upload first, then ledger event. The hash on screen, the hash in the upload header, the SHA-256 of the uploaded bytes, and the ledger's `frameSha256` must all match.
2. A failed upload must not create a ledger event, and retrying must work.
3. The guest flow (arrival and departure photos) in the browser.
4. The manager dashboard and property page at desktop width.
5. Everything against the live Supabase project, and uploads against a real R2 bucket.

## Remaining work, in small chunks

Each chunk can be done and checked on its own.

1. **Finish the capture check.** Run `scripts/capture-flow.mjs` (instructions in its header). Extend it to click "Record photo" and assert items 1 and 2 above.
2. **Run the SQL tests.** Start a scratch Postgres, set `PGHOST`, `PGPORT`, `PGUSER`, and run `npm run test:db`.
3. **Live test with your Supabase.** Create a property, a room, a stay, and a crew link in the dashboard. Open the link on a phone and record one photo. Then run "Verify" on the room.
4. **R2 bucket.** Create a private bucket and an API token limited to it. No CORS rule is needed, because the server uploads the photo (`src/lib/storage.ts`) and the browser only loads short-lived signed links. Set `STORAGE_ENDPOINT` to the account address without the bucket name at the end. Confirm a photo lands in the bucket and shows in the property activity list.
5. **Retention rule.** Add an R2 lifecycle rule to delete photos after the chosen number of days. The ledger keeps the fingerprints.
6. **Send links by email.** Resend or similar. SMS needs US carrier registration, so start with email.
7. **Offline queue** for captures taken without signal.
8. **Later:** Three.js room viewer, vision comparison of arrival and departure photos, iCal sync.

## Costs to keep in mind

- Supabase Free pauses a project after a week of inactivity. Budget for Supabase Pro ($25 a month) before real customers.
- Photo storage on R2 is the cheap part. See `docs/OPERATING_BUDGET.md`.

## Gotchas

- Order the ledger chain by the per-room `seq`, never by `id`.
- Reference `NEXT_PUBLIC_*` variables literally in code, or they are not inlined into the browser bundle.
- Next 16 uses `src/proxy.ts`, not `middleware.ts`.
- `src/app/dev-preview/page.tsx` renders the capture screen with sample rooms for browser tests. It returns 404 in production.
- The headless browser test needs `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.

## Property guide, crew tasks, readiness (migration 20261022000000_property_guides.sql)
- Manager builds the guide at `/dashboard/properties/[id]/guide`: check-in/checkout/house rules, per-room tutorials, allergen notes, and crew tasks (optionally needing a photo).
- Guest link shows procedures and each room's guide (allergens first). Crew link shows each room's tasks; ticking records a `checklist_item` ledger entry with `payload.itemId` (photo tasks also carry the frame hash). Finish room is gated until all tasks are recorded.
- Property page shows readiness for the latest stay, computed from the ledger (`src/lib/readiness.ts`): ready = every room finished and every task recorded.
- Apply the migration in the Supabase SQL editor; screens degrade gracefully until then. Browser check: `scripts/tasks-flow.mjs`.

## Theme and dashboard
Light/dark is set by `data-theme` on `<html>` (tokens in `globals.css`; always-dark surfaces such as the camera use `data-theme="dark"`). Dashboard metrics and calendar logic: `src/lib/overview.ts`; sample-data preview at `/dev-preview/dashboard` (dev only). Phone testing: `docs/PHONE_TESTING.md`. SMS plan: `docs/design/sms-plivo.md`.

## Property model, wizard, 3D viewer (migration 20261023000000_property_model.sql)
- The property is a tree: property > room > feature (hot tub, fireplace, lock, Wi-Fi...). Room size and position live on `rooms` (stored in meters, entered in feet); features in `room_features`.
- A feature's status is never stored on the feature. It is the latest `feature_status` ledger entry for it (`featureStatuses` in `src/lib/model.ts`), so history is kept and the guest view can't drift from the owner's record. `feature_status` and `baseline_photo` are manager-only event types; the API checks the feature belongs to the room.
- Wizard: `/dashboard/properties/[id]/setup?step=layout|features|baseline|review`. Review shows the Three.js view (`PropertyViewer`, loaded on demand), the listing as advertised, and status controls.
- Manager baseline: `/dashboard/properties/[id]/walk` reuses the capture screen (`role="manager"`), authenticated with the manager's session token; each photo is a `baseline_photo` entry, per room or per feature.
- Guests see advertised features and any that are out of service in their room (`LinkGate`).
- Dev previews: `/dev-preview/model` (viewer), `/dev-preview?role=manager|guest|crew`. Browser test: `scripts/tasks-flow.mjs`.
- Not built yet: maintenance tickets that change a feature's status, per-asset data (speed tests, sensor readings, subscriptions), real 3D scans, per-asset chains. Apply the migration in the Supabase SQL editor first.
- Occupancy rule: layout, adding/removing features and the baseline walk are blocked while a guest is in house (stay covering now); they resume at checkout. Feature status changes are always allowed. No push messages to guests: they see the current status when they open their link. Enforced in `src/app/dashboard/model-actions.ts` (`occupiedMessage`) and on the setup and walk pages. The baseline API itself does not check occupancy.

## Issues, upkeep, chain of custody (no new migration)
- Everything is a ledger entry in the room's chain; there is no ticket table. `issue_reported` (guest, crew, owner; needs a note, optional category/feature), `issue_resolved` (crew, owner; `payload.issueId` = ledger id of the report or of a crew `damage_report`), `maintenance_done`, `inspection` (crew, owner), `tutorial_sent` (owner, not wired yet). Open issues = reports with no resolution pointing at them (`src/lib/issues.ts`).
- Who acted is stamped by the server and cannot be supplied by the client: `payload.issuedTo` (the name the owner typed when creating a crew/guest link, carried in the signed link) and `payload.actorId` (the owner's user id). Both are inside the hashed payload.
- Guests and crew: "Report a problem" on each room (photo + note). It does not count as an arrival or verification photo. Owner: "Issues and upkeep" panel on the property page (resolve, or log a problem, maintenance or inspection note).
- Printable record for insurance or a damage claim: `/dashboard/properties/[id]/custody?stay=` (baseline before the stay, timeline during and after, per-room chain check, photo fingerprints and thumbnails). Use the Print button to save a PDF.
- Not built: sensor and device notifications (needs a `system` actor, a ledger constraint change and a webhook), sending tutorials by SMS, exporting the record as a file.

## Owner property creation + deploy pipeline
- Add property -> `/dashboard/properties/[id]/setup?step=rooms` (room presets) -> Layout (drag/resize `LayoutStudio`, live 3D, batch save via `saveLayoutBatch`) -> Features -> Baseline walk -> Guide -> Stay/links. `SetupProgress` card on the property page tracks it (`src/lib/setup.ts`).
- Deploy: `docs/DEPLOY_VERCEL.md`. Check `/api/health` (commit + which env vars are set), `/demo` (sample-data tour, needs `ENABLE_DEMO=1`), `/dev-preview/layout`.
- Verified: tsc, vitest (168), build. Not yet browser-tested: layout drag/resize. Not run: `npm run test:db` for this batch, live Supabase/Vercel.

## Rooms, assets and guest help
- Setup > Rooms: rename or remove rooms (a room with ledger history can't be removed). Setup > Features: edit an asset (name, type, details, shown to guests) and attach guest help to an asset or a room: web links or uploaded PDFs (private `property-files` bucket, signed 6 h links on the guest page).
- Migration `20261024000000_room_resources.sql` must be applied in Supabase (creates `room_resources` and the bucket). Edits to assets wait while a guest is in house; adding help is always allowed.
- Checks: `scripts/guest-help-flow.mjs` (guest view), `scripts/layout-flow.mjs`.
- Next: SMS (design in docs/design/sms-plivo.md), PMS calendar import, maintenance tickets.

## Room scan (guided panorama)
- `/dashboard/properties/[id]/scan?room=ID`: the manager stands in the room and turns; the phone's direction sensors place 24 markers (a ring of 12 at the horizon, 6 up, 6 down) and a photo is taken at each. Without direction sensors the photos are taken in order. Each frame is hashed on the phone, uploaded to storage, and sealed as a `scan_frame` ledger entry (direction in the payload); a `scan_complete` entry records the time and GPS position. Needs photo storage (R2) configured.
- The viewer (`ScanViewer`) lays the photos on a sphere with CSS 3D (no WebGL, so no storage CORS setup). It overlaps and feathers photos; it does not stitch them. The "Photo coverage" slider corrects the assumed field of view.
- Logic and tests: `src/lib/scan.ts`. Browser check: `scripts/scan-flow.mjs`. Demos: `/dev-preview/scan`, `/dev-preview/scan-view`.
- Next: estimate room shape and dimensions from the panorama; pin assets on the view; crew scans for damage comparison.

## Removing properties
- Settings on the property page has "Remove property". With no recorded history it deletes the property, rooms and stays. With history (the ledger can't be erased) it archives: `properties.archived_at` is set, the dashboard hides it, crew and guest links stop working. Blocked while a guest is in house. Needs migration `20261026000000_property_archive.sql` for archiving; `supabase/apply-pending.sql` holds migrations 22 to 26.

## Independent timestamps

The ledger is tamper-evident in normal use (database triggers block changes), but its time comes from the server clock. Once a day `/api/anchor` (a Vercel cron, `vercel.json`) combines the latest fingerprint of every room in a property into one SHA-256 digest and has an outside RFC 3161 timestamp authority sign it. The full reply is stored in `ledger_anchors` (append-only, owner can read). The custody page lists them, downloads the `.tsr`, and checks that today's records still match the latest one.

Setup: run migration `20261027000000_ledger_anchors.sql` (also in `supabase/apply-pending.sql`), add `CRON_SECRET` (any long random string) in Vercel and redeploy. Optional `TSA_URL` (default `https://freetsa.org/tsr`; use a commercial authority such as DigiCert for formal evidence). Check `/api/health` for `cronSecret`. Not yet exercised against a live authority from this environment (outbound access is blocked); the request bytes are verified identical to `openssl ts -query`.

## Dispute packet

Custody page, "Download dispute packet" (`/api/properties/[id]/packet?stay=`), owner only. A zip with `ledger.json` (every entry in the exact text form that was fingerprinted, from the `ledger_export_rows` function, migration `20261028000000`), the stay's photos named by SHA-256 (up to 40, bytes re-hashed before inclusion), the signed timestamps, and `verify.mjs`, a dependency-free Node script that re-computes entry fingerprints, chain links, photo fingerprints and timestamp digests. Logic in `src/lib/packet/`; the test runs the shipped script against good and tampered packets. The packet shows what was recorded and when, not who caused damage.

## Co-managers, edit log, alerts

- **Co-managers:** `property_members` (by email). `can_manage_property(pid)` (owner or invited email in the JWT) backs every owner policy; owner alone can insert/delete properties and edit the manager list. Server side, `property_manager_ids` (service role) feeds `RoomRecord.managerIds`; `authorizeRoomAccess` uses `canManageRoom`. UI: Property settings > Managers (`TeamForms`, `team-actions.ts`).
- **Edit log:** `config_audit`, filled by triggers on properties, rooms, room_content, room_checklist_items, room_features, room_resources, room_feature_pins and property_members (before/after, auth.uid(), JWT email). Append-only. Shown on the custody page and shipped in the dispute packet as `config_changes.json`. Edits made through the service role carry no actor, so owner screens must keep using the session client.
- **Alerts:** `src/lib/alerts.ts` (Resend email, Plivo SMS) fired by `alertHook` via `after()` from `/api/ledger` and owner issue actions, for `issue_reported`, `damage_report` and a guest's `condition_ack` with `agrees:false`. Env: `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_FROM`; contacts per property (`alert_email`, `alert_phone`), owner sign-in email by default. `/api/health` shows `alertEmail` and `alertSms`. Not exercised against the real providers.

## Before/after, guest acknowledgment, offline capture

- **Before/after:** `/api/scan-compare?room=` compares the newest finished scan with the one before (frames paired by look direction within 20 degrees; 16x16 brightness grids, exposure-normalized; `sharp` on the server). Shown on the scan page as "Before and after". It flags places to look, it does not detect damage.
- **Guest acknowledgment:** guest event `condition_ack` `{agrees, note}`; the server stamps `asOfSeq` (the room's newest entry at that moment). "Yes, as shown" records one per room; "Something's different" records one in the chosen room with a required note and alerts the owner.
- **Offline capture:** `src/lib/offlineQueue.ts` (IndexedDB). Entries without a photo queue automatically when there is no signal; photos offer "Save on this phone and send later". Queued entries carry `capturedAt` (phone clock) and `queued: true`; the ledger time is when it was received. Sent on reconnect, every 30 s, or "Send now"; rejected entries are shown with a Discard button.

## Module screens, pricing and billing pages

- **Three flows, three components:** owners work in the dashboard (VeriSpace Suite); crew links open `ServiceHome` (VeriService: start room, one task at a time, closing photo, finish, next room); guest links open `ConciergeHome` (VeriStay: check in, during stay, check out). `CaptureApp` dispatches by role and still owns the camera, upload, offline queue and ledger calls.
- **Pricing:** public `/pricing`, a pricing section on the landing page, and `/dashboard/billing` (per-property breakdown, free window, monthly total). All read `src/lib/billing.ts`; `billing.pages.test.ts` keeps the worked examples honest. Nothing is charged yet; payment provider is Stripe (see `docs/PRICING.md`).

## How guests and crew get their links

Links are never shown or copyable. From a stay in the dashboard the owner presses **Text** (to the phone on the booking, stored as +E.164 in `reservations.guest_phone`) or, as the fallback, **Email instead** (`guest_email`, the email of record). Crew work the same way from a per-property crew list (`crew_contacts`, added in Property settings). The server action `sendLink` (`src/app/dashboard/link-actions.ts`) signs the link, sends it through Plivo (SMS) or Resend (email) from `src/lib/deliver.ts`, and logs the send (masked address, status, who sent it) in the append-only `link_deliveries` table. `/api/guest-links` now returns 410. Needs `PLIVO_*` and `RESEND_API_KEY`/`ALERT_FROM_EMAIL`; without them the buttons say what is missing. Migration `20261030000000_link_delivery.sql` (also in `supabase/apply-pending.sql`).

Not built yet: sending automatically at check-in time (needs a scheduler finer than the daily cron), a code the guest must enter to prove they hold the phone, and delivery receipts from Plivo.
