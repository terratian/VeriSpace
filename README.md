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
cp .env.example .env.local   # Supabase URL + publishable key, secret key, CAPABILITY_SECRET
npm run dev
npm test            # unit tests
npm run test:db     # ledger migration tests (needs a scratch Postgres)
```

Apply `supabase/migrations/*.sql` to your Supabase project first, in order (SQL Editor, or `supabase db push`).

Manager sign-in: enable the Google provider (or just email) in Supabase → Authentication → Providers, and add `http://localhost:3000/auth/callback` plus your deployed URL's `/auth/callback` under Authentication → URL Configuration → Redirect URLs.

## Status

Built and tested: append-only Merkle ledger and Row Level Security (Postgres), capability magic links, client-side frame hashing, ledger append/verify API, crew and guest capture pages, manager sign-in and a basic property/room dashboard.
Not yet tested against a live Supabase project: the API/Supabase client code and sign-in flow.
Not built yet: link creation and ledger viewer in the dashboard, SMS/email delivery of links, raw photo storage (R2), Three.js room viewport, vision comparison worker, iCal sync.
