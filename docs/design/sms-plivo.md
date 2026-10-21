# SMS touchpoints: Plivo sub-accounts (staged, not built)

Direction from the owner, filed for later integration. Status: design only. Nothing here is wired in.

## Pipeline
1. **Tenant activation.** When a manager onboards, the backend creates a Plivo sub-account for them and stores its auth id and token. Sub-account charges roll up to the master account, so usage must be metered and passed down to the tenant's plan.
2. **Outbound.** A queue worker sends the guest link at 48h before arrival, a check-in confirmation 1h after arrival, a mid-stay check, and a checkout reminder the evening before. Each message carries the signed guest link already built in `src/lib/links.ts`.
3. **Inbound.** One Plivo XML Application points its Message URL at a single webhook. The webhook finds the tenant and stay, then routes the text: "damage"/"broken" becomes a damage claim, anything else a maintenance ticket.
4. **PWA.** The guest link unlocks concierge chat and damage upload once the stay is checked in. An upload from the PWA and an SMS both create the same maintenance record.

## Owner's reference code (kept for context)
- `POST /api/v1/tenant/activate-sms`: `plivoClient.subAccounts.create({ name, enabled })`, then store `authId` and `authToken` on the tenant.
- `POST /api/v1/sms/inbound`: read `From`, `To`, `Text`; look up the reservation; insert into `concierge_logs` (damage) or `maintenance_tickets` (default); reply with XML.

## Fixes needed when this is built
- **Fit this repo.** Use Next route handlers (`src/app/api/...`), not Express. There is no `tenants` table: ownership is `properties.owner_id` with RLS. `reservations` has no `guest_phone` or `status` yet.
- **Resolve the tenant by `To`, not only `From`.** The sample looks up by guest phone alone, so one number texting two tenants' properties is ambiguous. Map each Plivo number to a property or tenant, then find the stay by `From` within it.
- **Verify the webhook.** Check Plivo's `X-Plivo-Signature-V3` and timestamp before acting, or anyone can post fake tickets.
- **Protect sub-account tokens.** Encrypt at rest (not a plain column) and keep them server-side only.
- **Reply format.** Plivo replies need `<Message src="..." dst="...">text</Message>` inside `<Response>`; the sample's TwiML-style tag won't send. The sample also has a `--` SQL comment inside JavaScript, which is a syntax error.
- **Writes through the ledger.** Damage claims should append to `room_state_ledger` as `damage_report` (guest role) so they stay in the chain; tickets are a separate working table that references the ledger entry.
- **Compliance.** US numbers need 10DLC brand and campaign registration, opt-in consent, and STOP/HELP handling. Plan for this before any real sends.
- **Webhook URL** must be a full path, for example `https://<domain>/api/sms/inbound`.

## Tables to add
`phone_numbers` (number, tenant/property), `sms_messages` (direction, stay, body, status), `maintenance_tickets` (property, room, asset, stay, source, status, ledger entry id), plus `guest_phone` on reservations.

## Longer-term model (BIM-style layers per room)
3D geometry and baseline scan; 4D time (stays, turnovers; mostly built); 5D cost; 6D assets and sensors; 7D maintenance lifecycle and spares kit. Filtered views: crew (built), maintenance, guest (SMS plus PWA).
