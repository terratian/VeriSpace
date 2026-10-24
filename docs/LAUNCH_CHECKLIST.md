# Launch checklist: Delaware C-corp and getting paid

Not legal, tax or accounting advice. This is a list of things to do and ask a lawyer or accountant about. Figures come from Rho's [Stripe Atlas vs. Clerky guide](https://www.rho.co/blog/stripe-atlas-vs-clerky) (a banking vendor's blog) and must be checked at the source before you rely on them.

## What does what

| Need | Who | Notes |
|---|---|---|
| Form the Delaware C-corp, issue founder stock, 83(b) | **Clerky** (chosen) | $819 lifetime or $427 pay-per-use per the guide; first-year registered agent included; 83(b) pre-filled with reminders. Not a law firm. The guide says Clerky announced it is joining Stripe; confirm. |
| Bank account | A business bank (choose one) | Clerky does not include one. |
| Take payments, subscriptions, tax calculation | **Stripe** (Billing, Tax) | Stripe is the processor, so **you are the seller**: Stripe Tax calculates and collects sales tax, but registering in states and filing returns stays with you (or an accountant or filing service). Does not run your company. See [PRICING.md](PRICING.md). |
| Delaware annual report and franchise tax | You (or your accountant) | Due **March 1** each year. Per the guide, $50 report fee plus franchise tax of at least $175 or $400 depending on method. A startup with few assets usually wants the assumed par value method. Ask your accountant. |
| Federal and state income tax, bookkeeping | Accountant / bookkeeping tool | A C-corp files its own return (Form 1120) even with no profit. |

## Order of operations

1. **Before you form:** decide founders and split. Decide your state of residence (a Delaware corporation run from North Carolina usually must register as a foreign corporation there, with its own fees and filings; ask a lawyer).
2. **Form with Clerky:** certificate of incorporation, bylaws, board consent, founder stock purchase, 83(b) election. **File the 83(b) within 30 days of the stock purchase**, no extensions. Mail it with proof of delivery.
3. **Get the EIN** (the IRS issues it free) and open the **business bank account**. Keep company money and your own separate from day one.
4. **Assign the IP.** Sign an IP assignment so the company owns the code, brand and the patent application (if filed in your name, ask a patent attorney how to assign it to the company).
5. **Register where you operate** (foreign qualification in your home state, local business license if required).
6. **Set up Stripe** with the company's details: legal name, EIN, bank account, website with pricing and terms. Stripe verifies the business (KYC) before payouts. Turn on Stripe Tax only after you know where you must register.
7. **Publish the basics:** terms of service, privacy policy, refund and cancellation policy, and a pricing section on the landing page (Stripe's business verification looks for them).
8. **Compliance calendar:** March 1 Delaware report and franchise tax; registered agent renewal (first year included); quarterly estimated taxes if profitable; annual federal return; foreign-state annual reports.
9. **Bookkeeping** from the first dollar: receipts for every cost (Vercel, Supabase, Cloudflare, domains, the patent attorney).

## Ask a lawyer or accountant

- Whether a C-corp is right for you versus an LLC (a C-corp suits outside investment and stock options; an LLC is simpler if you will not raise money).
- Franchise tax method and how many shares to authorize.
- Foreign qualification in your home state and what it costs.
- How the patent application is assigned to the company.
- Sales tax: which states you must register in as a seller of software subscriptions (thresholds and taxability differ by state), and who files.
- Terms of service and privacy policy suited to storing property photos and guest data.
- Insurance (general liability and cyber) once you hold customers' property records.
