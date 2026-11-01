# Billing and payments

## Plan math

- Whole plan: **$89.94 / month**
- Seats: **6**
- Per seat: **$14.99 / month**

Term prices are flat and rounded:

| Term | First term | Renewal |
| --- | --- | --- |
| Quarterly (3 mo) | $45 | $51 |
| Half-year (6 mo) | $90 | $96 |
| Annual (12 mo) | $180 | $180 |

Term 1 uses the first-term table; every later term uses renewal. The invoice states which one
applies before payment. All values are editable in Settings → Plan & pricing.

## Invoice lifecycle

1. Member picks a term (or admin creates the invoice).
2. Coverage starts the day after the current paid-through date, or today.
3. Due date = issue date + **payment due window** (default 7 days, editable).
4. Reference `A1-XXXXXXXX` is unique and printed on the invoice.
5. An **invoice email** goes out immediately with USD, CNY, due date and reference.
6. Member pays externally, then taps “I have sent this payment” with amount, method and transaction id.
7. Admin approves (or rejects) under **Invoices → Payments to review**; a receipt email follows.
8. Approval extends `paid_through` to the invoice period end.

Partial payments are refused by default; the admin can tick **accept partial payment** when
approving a reported amount below the invoice.

## CNY

Each invoice locks the USD→CNY rate at issue time, so the CNY figure never moves. Rates come from
frankfurter.app (ECB, no key) with open.er-api.com as fallback. A manual rate can be set in
Settings for offline deployments or to match the payment app's own spread.

## Renewals and removal

- **Renewal notice**: 7 days before `paid_through` (editable) the member gets an email and the
  admin gets one summary. Skipped if the member already has an open invoice.
- **Reminders**: 7 days before the invoice due date.
- **Grace**: 1 day by default. At one day late the seat is flagged for removal, the member gets a
  removal warning, and the admin digest lists them under “Past grace — remove or contact”.
- Removal itself is always an admin action (Members → Remove seat).

## Why no automatic bank hook

WeChat Pay, Alipay, Venmo and Zelle expose no webhook/API for personal transfers. Automating it
would need mailbox parsing or scraping a bank session with 2FA — fragile and against the terms.
This build handles confirmation manually; there is no ingest endpoint.
