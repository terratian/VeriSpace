# VeriSpace

**Real Spaces. Verified On-Chain.**

A trustless spatial ledger for short-term rentals (Airbnb/VRBO): room-by-room 3D digital twins, an append-only cryptographic condition ledger, and role-based workflows for owners, service crews, and guests.

- Project Bible: [`MASTER_PROJECT_SPEC.md`](MASTER_PROJECT_SPEC.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Budget & revenue model: [`docs/OPERATING_BUDGET.md`](docs/OPERATING_BUDGET.md)
- Demo landing page: [`index.html`](index.html) (enable GitHub Pages: Settings → Pages → `main` / root)

## Running the app

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys and CAPABILITY_SECRET
npm run dev
npm test            # unit tests
npm run test:db     # ledger migration tests (needs a scratch Postgres)
```

Apply `supabase/migrations/*.sql` to your Supabase project first.

## Status

Built and tested: append-only Merkle ledger (Postgres), capability magic links, client-side frame hashing, ledger append/verify API, crew and guest capture pages.
Not built yet: manager sign-in and dashboard UI, SMS/email delivery of links, raw photo storage (R2), Row Level Security policies, Three.js room viewport, vision comparison worker, iCal sync.
