# 0001: Where photos are stored

Status: accepted (not yet implemented; the ledger records hashes only today)
Date: 2026-10-20

## Decision

Store photos in **Cloudflare R2** (private bucket), behind a small `PhotoStore` interface so the provider can change later. The ledger keeps only the SHA-256 and an object key.

## Why

Pricing below was read from the providers' pages on 2026-10-20. Re-check before committing money.

| | Cloudflare R2 (Standard) | Supabase Free |
|---|---|---|
| Storage included | 10 GB-month free, then $0.015 per GB-month | 1 GB |
| Egress | Free | 5 GB per month |
| Writes (Class A) | 1M free, then $4.50 per million | n/a |
| Reads (Class B) | 10M free, then $0.36 per million | n/a |

Sources: [R2 pricing](https://developers.cloudflare.com/r2/pricing), [Supabase pricing summary](https://makerkit.dev/blog/md/saas/supabase-pricing).

1. **Supabase's free storage cannot hold this workload.** At the volume modelled below, one property produces about 140 MB a month, so 1 GB lasts roughly seven property-months. R2's free 10 GB covers five properties for about 14 months with no deletions.
2. **Evidence is read-heavy.** Managers open photos during disputes, exports go to platforms, and the vision worker reads every photo at least once. R2 charges nothing for egress; Supabase meters it ($0.09 per GB past 250 GB on Pro).
3. **Keep the ledger database small and safe.** Photos never touch the 500 MB free (8 GB Pro) database. A database restore or pause does not affect evidence files.
4. **No lock-in.** R2 speaks the S3 API.

Costs of this choice: one more vendor and set of credentials, presigned-URL plumbing, and access mediated by our API rather than by Postgres RLS.

## Cost model

Assumptions (adjust freely): 25 photos per stay (about 15 crew, 5 arrival, 5 departure), 0.7 MB per photo (JPEG, at most 2048 px on the long edge), 8 stays per property per month (the figure the earlier budget used), 12 months of retention.

| Properties | New photos per month | Steady state at 12 months | R2 storage per month | Writes per month |
|---|---|---|---|---|
| 5 | 0.7 GB | 8.4 GB | $0.00 (inside free 10 GB) | 1,000 (free) |
| 100 | 14 GB | 168 GB | about $2.37 | 20,000 (free) |
| 1,000 | 140 GB | 1,680 GB | about $25 | 200,000 (free) |

Retention is a product and legal decision, not an engineering one. A 90-day window cuts the steady state by about four. Check each platform's current claim deadlines before choosing. The ledger entry (a hash) is tiny and can be kept forever; only the photo file would expire, and a lifecycle rule handles that.

## Integrity design (to build)

- Key photos by content: `photos/{propertyId}/{sha256}.jpg`.
- The browser hashes the exact bytes it uploads. The server must confirm the stored object hashes to the claimed value before it writes the ledger entry, either through R2's SHA-256 checksum on upload (confirm support when implementing) or by re-hashing the object.
- The ledger row stores the hash, so editing or swapping the file later is detectable.
- Honest limit: a web page cannot read the camera sensor's raw data. "Unedited" means the bytes as first produced by the browser at capture time. Direct camera-app files (the fallback path) are hashed as the file arrived.

## Revisit if

The product moves entirely onto Supabase Pro and one vendor matters more than egress cost, or if photo volume stays under about 1 GB for the first customers (then Supabase Storage would be simpler to start).

## Not decided here

Offline capture queue, thumbnail generation, and the vision comparison worker.
