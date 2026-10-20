# VeriSpace Operating Budget & Revenue Model

All figures are planning estimates from the initial design session. Verify vendor pricing and free-tier limits before relying on them.

## Monthly operating cost (1–5 properties, ~40 turnovers/month)

| Component | Provider | Monthly |
|-----------|----------|---------|
| PWA edge hosting | Cloudflare Pages / Vercel (free tier) | $0.00 |
| Database & auth | Supabase (free tier) | $0.00 |
| 3D mesh & keyframe storage | Cloudflare R2 | $0.00 |
| SMS capability links | Twilio / Resend | ~$1.00 |
| AI vision verification | Gemini / Claude API (pay-as-you-go) | ~$0.50 |
| **Total** | | **~$1.50** |

Free tiers have usage caps and Supabase free projects can pause when idle, so a paid tier will likely be needed before real customers.

## Revenue model (per property)

| Item | Monthly |
|------|---------|
| Planned B2B subscription | $19.00 |
| Estimated compute cost per property | ~$0.30 |
| Gross margin | ~98% |

## Competitive reference (estimates, unverified)

Hosts today may combine separate tools for operations, guidebooks, and damage evidence. The planning session estimated roughly $41/month per property for that combined stack (about $12 + $10 + $19). These competitor prices were not checked against current price lists and should be confirmed before use in any external pitch.
