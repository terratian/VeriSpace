# Pricing model and how to implement it

Decided 2026-10-24 (payments on **Stripe**, chosen 2026-10-24 after comparing Paddle): **$9.99 per property (listing) per month. An account's first property is free for 3 months.**

This page is the plan. Nothing here is charged yet. The rules are implemented and tested as pure functions in `src/lib/billing.ts`; the payment provider (Stripe) is not wired yet.

## The rules

1. A **property** is one listing the owner or manager sets up. Each active property costs **$9.99 per month**.
2. The account's **first property ever** is **free for 3 months** from the day it was added. No card is needed to start.
3. Every property after the first is billed from the day it is added (prorated for the first month).
4. **Archived or deleted properties are not billed.** Archiving the first property and adding another does not earn a second free period: the free period belongs to the account's first property.
5. **Co-managers, crew links and guest links are free and unlimited.** Price follows the number of listings, not the number of people or stays.
6. **Records are never held hostage.** If payment fails, the account keeps read access and can always export dispute packets. Only new setup and new capture are limited, after a grace period (see below).
7. Fair use (proposal, not yet enforced): up to 20 rooms per property and 20 GB of photos per property. Beyond that, talk to us. Revisit with real usage data.

Worked examples (today is after the free period unless stated):

| Account | Monthly bill |
|---|---|
| 1 property, month 2 | $0.00 |
| 1 property, month 4 | $9.99 |
| 3 properties, month 2 | $19.98 (the first is free, two are billed) |
| 3 properties, month 6 | $29.97 |
| 3 properties, one archived mid-month | prorated credit for the archived one |

## Why per listing, and why this shape

- It matches how short-term-rental owners already think and budget: per door. It scales with the value they get without counting bookings, rooms or crew, which they would try to game or resent.
- A flat per-listing price is simple to say in one sentence on the landing page and to explain to a family member who manages three cabins.
- **No card for the free period** removes the biggest barrier for a small owner and lets them finish setting up (the slow part) before paying. The cost is a conversion drop at day 90. The plan below counters it with reminders and an easy upgrade path.

Alternatives considered and set aside:

| Option | Why not (for now) |
|---|---|
| Per room | Penalizes the careful owner who records more rooms, the behavior we want. |
| Per booking / per turnover | Unpredictable bills, and it taxes the exact moments the product exists for. |
| Tiers (Starter/Pro) | Adds a pricing page and upgrade friction before we know which features differ in value. |
| First property free forever | Fine for growth, but offers no revenue from single-listing owners, who are most of the market. Revisit if conversion at day 90 is poor. |

## Unit economics (estimates)

Inputs: [OPERATING_BUDGET.md](OPERATING_BUDGET.md) (fixed about $26 to 30 per month, compute about $0.30 per property, unverified) and [decision 0001](decisions/0001-photo-storage.md) (about $0.024 per property per month in photo storage at 100 properties).

| Per property per month | Amount |
|---|---|
| Revenue | $9.99 |
| Card processing, 2.9% + $0.30 | about $0.59 |
| Billing product, about 0.7% of volume | about $0.07 |
| Compute | about $0.30 |
| Storage | about $0.03 |
| Alerts (email/SMS), assumed | about $0.10 |
| **Margin** | **about $8.90 (89%)** |

- Break-even on fixed costs is about **4 paying properties**.
- A free signup costs about $0.45 per month, so **about $1.40 over the 3 free months**.
- Stripe figures come from a secondary summary (Orb's 2026 write-up of Stripe's published rates) and must be checked against stripe.com/pricing before launch. Taxes (Stripe Tax is 0.5% per qualifying transaction on its no-code option, same caveat) are on top.

## Best implementation

**Use Stripe Billing with one recurring price and a quantity, and keep the free period and the property count in our own database.** Reasons: Stripe handles cards, receipts, proration, tax and the customer portal; our database knows the properties; the free-period rule is simple enough to own, and owning it avoids coupon edge cases (a coupon discounts an invoice, not "one unit for 3 months").

### Data

```
billing_accounts
  owner_id uuid primary key         -- the account owner (auth user)
  stripe_customer_id text
  stripe_subscription_id text
  state text                        -- 'free' | 'active' | 'past_due' | 'canceled'
  past_due_since timestamptz
  created_at timestamptz
```

The property list (`properties.created_at`, `properties.archived_at`) is the source of the count. `billingStatus()` turns it into `billableCount`, the free window and the days left. Keep deleted properties' creation dates (a small `property_history` row, or never hard-delete a property that has billing history) so the "first property ever" rule can't be reset by deleting it.

### Stripe objects

- One **Product** "VeriSpace property", one monthly **Price** of $9.99, `licensed` (per unit).
- One **Customer** per account owner.
- One **Subscription** with a single item whose **quantity = `billableCount`**. Stripe does not allow creating a subscription at quantity 0, so create it the first time `billableCount` is at least 1 (usually a second property, or day 90). Until then there is no Stripe subscription and the account is `free`.
- Quantity changes use `proration_behavior: create_prorations`, so adding a property mid-month charges the remainder and archiving one credits it.
- Enable the **customer portal** for card updates, invoices and cancellation. Enable **Stripe Tax** if selling in places that require it.
- An optional **annual price** of $99 (two months free) can be added later as a second Price; no code change to the rules.

### Flow

1. **Sign up, add first property:** `billing_accounts` row created with `state = 'free'`. Dashboard shows "Free until <date>, N days left".
2. **Day 60, 80, 90 reminders** (email, using the alerts channel): "Your free period ends on <date>. Add a card to keep creating links and capturing records." Link goes to a **Stripe Checkout** session in subscription mode with `quantity = billableCount at day 90`.
3. **Adding a second property** while free: show the price before it is created ("This one is $9.99 a month, billed from today"). If no subscription exists yet, send the owner through Checkout first.
4. **Webhooks** (`/api/stripe/webhook`, signature-verified, idempotent by event id): `checkout.session.completed` (store ids, state active), `invoice.paid`, `invoice.payment_failed` (state past_due, set `past_due_since`), `customer.subscription.deleted` (state canceled).
5. **Quantity sync:** a function `syncQuantity(owner)` runs after any property is added, archived or restored, and from a nightly cron as a safety net. It computes `billableCount` and updates the Stripe item if it differs. The free window ending is just the count rising by one, so the same sync handles it at the next nightly run.
6. **Failed payment:** Stripe retries (Smart Retries) and we email. Access follows `accessFor()`: full access for 14 days past due ("grace"), then **read-only** for setup and capture. Read, verify and **export always work**. Guest and crew links already issued keep working during grace; after it, new links cannot be created.

### Enforcement points (small, so it stays safe)

| Action | Blocked when |
|---|---|
| Create a property or link | access is `read_only` |
| Record a new ledger entry through a crew or guest link | access is `read_only` for that property's owner (show the crew a plain message, never lose the photo: it is held on the phone by the offline queue) |
| Read, verify, download dispute packet | never |

### Build order

1. **Show, don't charge (about 1 day):** dashboard banner using `billingStatus()`; "Free until <date>" and the price shown when adding a property. No Stripe yet. Gives us the real behavior to react to.
2. **Stripe Checkout and webhook:** `billing_accounts`, Checkout, portal link, webhook, quantity sync. Test in Stripe test mode.
3. **Enforcement and reminders:** grace and read-only, day 60/80/90 emails.
4. **Launch checks:** verify Stripe fees and tax, terms of service and refund policy, a clear cancellation path.

### Risks and open choices

- **Day-90 drop-off** with no card on file. Measure it; if it is bad, ask for a card at the end of setup instead (still no charge for 3 months).
- **Properties used as a free-tier trick** (many tiny properties). Each costs $9.99, so there is little incentive; the room cap above is a backstop.
- **Per-property pricing for managers with many cheap listings** may need a volume price later (for example $7.99 from the 10th property). Decide after the first customers.
- **Sales tax and VAT** depend on where customers are. Stripe Tax handles collection; registration is on us.
- A refund policy is needed before charging (suggestion: pro-rated refund on request in the first month).

## Alternative considered: Paddle (merchant of record)

Paddle would be the legal seller, collect and remit sales tax and VAT, and handle disputes, at about 5% + $0.50 per payment (about $1.00 on $9.99, margin about 86% instead of 89%), with a less restylable checkout, slower payouts and less configurable dunning. Paddle cannot create a subscription directly; one is created when a customer pays through checkout, which still fits the card-less free start. Figures come from comparison blogs. Chosen against for now because Stripe keeps billing, tax calculation, receipts, the customer portal and payouts in one well-documented place, and Clerky is reported to be joining Stripe. **The cost of that choice: with Stripe you are the seller, so you register for sales tax where required and file returns (Stripe Tax calculates and collects).** Revisit if tax paperwork becomes a burden. Switching changes only checkout, webhook and sync code; `src/lib/billing.ts` is provider-neutral.
