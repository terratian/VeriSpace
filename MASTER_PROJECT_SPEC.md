# PROJECT BIBLE: VERISPACE

**Project Vision:** A trustless, cryptographic spatial provenance and operations ledger for short-term rentals (Airbnb/VRBO), transforming properties into room-by-room digital twins with verifiable 3D state tracking, role-based workflows, and zero-fraud audit trails.

## Part 1: Branding & Identity (VeriSpace)

- **Brand Name:** VeriSpace (Verifiable + Space). Capital V, capital S, one "s" in "Veri".
- **Tagline:** Real Spaces. Verified On-Chain.
- **Visual Aesthetic:**
  - *Primary Theme:* Obsidian Void Black (`#0B0C10`) for cryptographic permanence.
  - *Secondary Theme:* Titanium Matte Slate (`#1F2833` / `#C5C6C7`) for architectural framing.
  - *Accent Theme:* Phosphor Luminous Mint (`#66FCF1`) for live WebGPU/Three.js spatial viewports and verified active states.

## Part 2: Core Philosophy & Architecture

1. **3D Spatial State > Flat Photos:** Properties are indexed as room containers with 3D coordinate spaces `(x, y, z)` rather than unstructured photo albums.
2. **Append-Only Merkle Ledger:** Every state update is cryptographically hashed and chained (`SHA-256` nonce chaining). Database rules block all updates and deletes to prevent tampering or backdating.
3. **Hardware-Adaptive 3D & Vision:** Supports LiDAR Pro devices alongside standard monocular depth/WebXR cameras and browser keyframe capture.
4. **Zero-Friction Zero-Signup Access:** Passwordless SMS capability magic links tied to iCal reservation windows with localized on-site challenge verification.

## Part 3: Roles

| Role | Auth | Primary workflow |
|------|------|------------------|
| Owner / Manager | OAuth | Multi-property dashboard, ledger audit, dispute evidence |
| Service Crew | SMS passkey | Geofenced snap-to-verify checklists per room |
| Guest | Ephemeral JWT (magic link tied to reservation window) | AR house guide, silent keyframe capture at arrival and checkout |

## Part 4: Planned Stack

- Next.js PWA (Vercel or Cloudflare Pages)
- Supabase (PostgreSQL 16, Row Level Security, auth)
- Cloudflare R2 for `.splat` meshes and raw keyframes
- Three.js / WebGPU room viewport; Web Crypto SHA-256 for client-side frame hashing
- Vision-model worker for arrival vs. checkout comparison
- SMS/email via Twilio or Resend

## Part 5: Related Documents

- `docs/ROADMAP.md` — phased build plan
- `docs/OPERATING_BUDGET.md` — operating costs and revenue model
- `supabase/migrations/` — database schema (initial migration is a draft; see its header)
- `index.html` — product demo landing page
