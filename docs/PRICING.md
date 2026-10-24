# Pricing model and how to implement it

Decided 2026-10-24: **$9.99 per property (listing) per month. An account's first property is free for 3 months.**

This page is the plan. Nothing here is charged yet. The rules are implemented and tested as pure functions in `src/lib/billing.ts`; the payment provider (Paddle) is not wired yet.

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

## Payment provider: Paddle (decided 2026-10-24)

Paddle is a **merchant of record (MoR)**: it is the legal seller to your customer, so it collects and remits sales tax, VAT and similar taxes, handles card disputes, and runs subscriptions, trials, proration and failed-payment recovery. You receive payouts.

**What an MoR does not do:** it does not form or maintain your company. Delaware formation, the registered agent, the annual report and franchise tax (due March 1), your own income taxes, bookkeeping, payroll and your terms of service stay with you. See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

Why Paddle for this product: owners are small, a per-listing price is global, and sales-tax registration in every state is the part a solo founder least wants. Cost: a higher fee per payment than a plain processor, a checkout that is Paddle's overlay or inline form (limited restyling), slower payouts, and less configurable dunning. Figures below come from vendor and comparison blogs and must be checked on paddle.com/pricing before launch.

## Unit economics (estimates)

Inputs: [OPERATING_BUDGET.md](OPERATING_BUDGET.md) (fixed about $26 to 30 per month, compute about $0.30 per property, unverified) and [decision 0001](decisions/0001-photo-storage.md) (about $0.024 per property per month in photo storage at 100 properties).

| Per property per month | Amount |
|---|---|
| Revenue | $9.99 |
| Paddle, 5% + $0.50 per payment (tax handling included) | about $1.00 |
| Compute | about $0.30 |
| Storage | about $0.03 |
| Alerts (email/SMS), assumed | about $0.10 |
| **Margin** | **about $8.56 (86%)** |

- Break-even on fixed costs is about **4 paying properties**.
- A free signup costs about $0.45 per month (no payment fees while free), so **about $1.40 over the 3 free months**.
- A fixed $0.50 per payment weighs more on small prices. An **annual price** (for example $99, two months free) cuts the fixed part from twelve payments to one and improves cash flow. Worth adding after launch.

## Best implementation with Paddle

**Keep the free period and the property count in our own database. Use Paddle only once a payment is due.** Paddle cannot create a subscription directly: a subscription is created when a customer pays through checkout, so the card-less free start fits naturally (no Paddle subscription until the first charge).

### Data

```
billing_accounts
  owner_id uuid primary key          -- the account owner (auth user)
  paddle_customer_id text
  paddle_subscription_id text
  state text                         -- 'free' | 'active' | 'past_due' | 'canceled'
  past_due_since timestamptz
  created_at timestamptz
```

The property list (`properties.created_at`, `properties.archived_at`) is the source of the count. `billingStatus()` in `src/lib/billing.ts` turns it into `billableCount`, the free window and the days left. Never hard-delete a property that has billing history, so the "first property ever" rule can't be reset by deleting it.

### Paddle objects

- One **Product** "VeriSpace property" with one monthly **Price** of $9.99 (one unit = one property).
- A **customer** per account owner, created at first checkout.
- One **subscription** per account whose single item has **quantity = `billableCount`**. It is created by the first checkout and changed by updating the item quantity.
- Quantity changes use a **proration billing mode** (required by the API): charge the remainder when a property is added mid-cycle, credit when one is archived. Pick the exact mode in the test environment.
- Customers manage cards, invoices and cancellation through the **portal links** Paddle returns with each subscription (generated with a server-side API key, short-lived, never stored).

### Flow

1. **Sign up and add the first property:** `billing_accounts` row, state `free`. Dashboard shows "Free until <date>, N days left". No card, no Paddle.
2. **Day 60, 80 and 90 reminders** (email through the alerts channel): "Your free period ends on <date>." The link opens **Paddle checkout** for `billableCount` units.
3. **Adding a second property while free:** show the price first ("This one is $9.99 a month, billed from today"). If no subscription exists yet, send the owner to checkout before the property is created.
4. **Webhooks** (`/api/paddle/webhook`, signature verified with the endpoint secret, idempotent by event id): subscription created or activated (store ids, state `active`), payment failed or subscription past due (state `past_due`, set `past_due_since`), subscription canceled (state `canceled`). Confirm the exact event names in Paddle's webhook reference when building.
5. **Quantity sync:** `syncQuantity(owner)` runs after any property is added, archived or restored, and from the nightly cron as a safety net. It computes `billableCount` and updates the Paddle item if it differs. The free window ending is just the count rising by one.
6. **Failed payment:** Paddle retries and runs its recovery flow. We email. Access follows `accessFor()`: full access for 14 days past due, then **read-only** for setup and capture. Read, verify and **export always work**. Issued guest and crew links keep working during the grace period; after it, new links cannot be created.

### Enforcement points

| Action | Blocked when |
|---|---|
| Create a property or link | access is `read_only` |
| Record a new entry through a crew or guest link | owner is `read_only`; show a plain message and keep the photo on the phone (the offline queue holds it) |
| Read, verify, download dispute packet | never |

### Build order

1. **Show, don't charge (about 1 day):** dashboard banner from `billingStatus()`, and the price shown when adding a property. No provider yet.
2. **Paddle sandbox:** create the seller account and pass its review (it asks about the business and website), product and price, checkout, webhook, quantity sync. Test entirely in the sandbox.
3. **Enforcement and reminders:** grace and read-only, day 60/80/90 emails.
4. **Launch checks:** current Paddle fees and payout terms, terms of service and refund policy (Paddle's buyer terms apply to checkout), a clear cancellation path.

### Risks and open choices

- **Day-90 drop-off** with no card on file. Measure it; if it is bad, ask for a card at the end of setup instead (still no charge for 3 months).
- **Paddle account review** happens before you can take live payments and can ask for a live site, a pricing page and terms. Build the landing pricing section and terms first.
- **Properties used as a free-tier trick** (many tiny properties). Each costs $9.99, so there is little incentive; the room cap above is a backstop.
- **Volume pricing** for managers with many listings (for example $7.99 from the 10th). Decide after the first customers.
- **Lock-in:** the rules in `src/lib/billing.ts` do not depend on the provider. Swapping providers changes only checkout, webhook and sync code.
