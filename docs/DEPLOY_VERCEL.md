# Deploying VeriSpace to Vercel

Every push to `main` on GitHub deploys automatically once the repo is connected. Branches and pull requests get their own preview URLs.

## One-time setup
1. vercel.com > Add New > Project > import `terratian/VeriSpace`. Framework: Next.js (auto-detected). Leave build settings alone.
2. Settings > Environment Variables. Add these for Production and Preview (values are in your `.env.local`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CAPABILITY_SECRET`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION=auto`.
   Also set `APP_ORIGIN` to the production URL (so crew and guest links point at it) and `ENABLE_DEMO=1` to turn on the sample-data tour at `/demo`.
   Or from your terminal: `bash scripts/vercel-env.sh` (needs `npx vercel login` and `npx vercel link` first).
3. Supabase > Authentication > URL Configuration: set Site URL to the production URL and add it, plus `https://*.vercel.app/**` for previews, to Redirect URLs. Without this the sign-in email link won't work on Vercel.
4. Supabase > SQL Editor: apply every file in `supabase/migrations`, oldest first (latest: `20261023000000_property_model.sql`).
5. Redeploy once after adding variables (Deployments > the latest > Redeploy).

## Check it
- `/api/health` lists what the server has configured (no secrets) and the commit it was built from.
- `/demo` is a tour of every screen with sample data, nothing saved. Open it on a phone for the capture screens.
- `/login` then `/dashboard` is the real app.

## Notes
- Phone cameras need HTTPS, which Vercel provides.
- The Vercel Hobby plan is for non-commercial use; move to Pro before real customers.
- `/dev-preview/*` and `/demo` are off in production unless `ENABLE_DEMO=1`.
