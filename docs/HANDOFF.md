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
