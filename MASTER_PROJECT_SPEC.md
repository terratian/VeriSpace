# PROJECT BIBLE: VERISSPACE
**Project Vision:** A trustless, cryptographic spatial provenance and operations ledger for short-term rentals (Airbnb/VRBO), transforming properties into room-by-room digital twins with verifiable 3D state tracking, role-based workflows, and zero-fraud audit trails.

## Part 1: Branding & Identity (VerisSpace)
* **Brand Name:** VerisSpace (Verifiable + Space)
* **Visual Aesthetic:** 
  * *Primary Theme:* Obsidian Void Black (`#0B0C10`) for cryptographic permanence.
  * *Secondary Theme:* Titanium Matte Slate (`#1F2833` / `#C5C6C7`) for architectural framing.
  * *Accent Theme:* Phosphor Luminous Mint (`#66FCF1`) for live WebGPU/Three.js spatial viewports and verified active states.

## Part 2: Core Philosophy & Architecture
1. **3D Spatial State > Flat Photos:** Properties are indexed as room containers with 3D coordinate spaces `(x, y, z)` rather than unstructured photo albums.
2. **Append-Only Merkle Ledger:** Every state update is cryptographically hashed and chained (`SHA-256` nonce chaining). Database rules block all updates and deletes to prevent tampering or backdating.
3. **Hardware-Adaptive 3D & Vision:** Supports LiDAR Pro devices alongside standard monocular depth/WebXR cameras and browser keyframe capture.
4. **Zero-Friction Zero-Signup Access:** Passwordless SMS capability magic links tied to iCal reservation windows with localized on-site challenge verification.
