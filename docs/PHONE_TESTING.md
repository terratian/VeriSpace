# Testing VeriSpace on your phone

Phone cameras only work on HTTPS (or localhost), so a plain LAN address will not open the camera. Pick one route.

## A. Cloudflare Tunnel (fastest, nothing to deploy)
1. `npm run dev -- -p 3030`
2. In a second terminal: `cloudflared tunnel --url http://localhost:3030` (install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). It prints an `https://<random>.trycloudflare.com` URL.
3. Put that URL in `.env.local` as `APP_ORIGIN=https://<random>.trycloudflare.com`, restart `npm run dev`.
4. Supabase > Authentication > URL Configuration: add the same URL to Redirect URLs (needed for sign-in links opened on the phone).
5. Open the URL on the phone, sign in, create property > room > stay > crew link, open the link, take a photo.

The URL changes each time the tunnel restarts; repeat steps 3 and 4.

## B. Vercel (stable URL)
1. Import `terratian/VeriSpace` in Vercel.
2. Add every variable from `.env.example` (Supabase, `CAPABILITY_SECRET`, `STORAGE_*`) and set `APP_ORIGIN` to the Vercel URL.
3. Add the Vercel URL to Supabase Redirect URLs.

## Check it worked
- Dashboard > property > room > "Verify" shows the chain intact.
- The photo is in your R2 bucket, and its SHA-256 matches the ledger entry.
- Apply all migrations in `supabase/migrations` (latest: `20261022000000_property_guides.sql`) first.

## Not built yet
Geofencing, manager baseline scan, 3D/splat viewport, LiDAR/WebXR capture. See `docs/ROADMAP.md`.
