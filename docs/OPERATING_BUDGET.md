# VeriSpace Operating Budget & Revenue Model

Planning estimates. Rows marked "verified" were checked against the provider's pricing page on 2026-10-20; the rest are carried over from the earlier planning session and have not been re-checked.

## Hobby stage (1–5 properties, about 40 turnovers per month)

| Component | Provider | Monthly | Status |
|-----------|----------|---------|--------|
| App hosting | Cloudflare Pages / Vercel (free tier) | $0.00 | not re-checked |
| Database and auth | Supabase Free | $0.00 | verified |
| Photos and 3D meshes | Cloudflare R2, free 10 GB | $0.00 | verified, see [decision 0001](decisions/0001-photo-storage.md) |
| SMS links | Twilio / Resend | ~$1.00 | **not verified, likely low** |
| AI vision | Gemini / Claude API (pay as you go) | ~$0.50 | not verified |
| **Total** | | **~$1.50** | |

## Before the first paying customer

The $1.50 figure only works for a hobby project:

- **Supabase Free pauses a project after one week of inactivity** and must be restored by hand. A product whose pitch is dependable, tamper-evident records cannot do that. Budget **Supabase Pro at $25 per month** (verified). Point-in-time recovery is a separate add-on, $100 per month for a 7-day window (verified); decide whether daily backups are enough.
- **SMS**: texts sent by an app to US numbers generally require carrier registration (A2P 10DLC), which carries one-time and recurring fees on top of the per-message price. I have not verified the current amounts. Check Twilio's pricing page before trusting the ~$1 line, or start with email links only.

A realistic starting figure is therefore about **$26–30 per month** plus SMS once registered.

## Photo storage at scale

See [decision 0001](decisions/0001-photo-storage.md). Short version: about $2.37 per month of storage at 100 properties, about $25 at 1,000, with free egress and free writes at those volumes.

## Revenue model (per property)

| Item | Monthly |
|------|---------|
| Planned B2B subscription | $19.00 |
| Estimated compute cost per property | ~$0.30 (unverified) |

Break-even on the $25 Supabase Pro fixed cost is about two paying properties, before any variable costs.

## Competitive reference (unverified)

The planning session estimated about $41 per month per property for a combined stack of separate tools (about $12 + $10 + $19). These competitor prices were not checked and should be confirmed before use in any external pitch.
