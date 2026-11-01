# Email and reminders

## SMTP

Configure under **Admin → Settings → Email**:

- host, port, implicit TLS
- username and password
- **From name** and **From email** (separate fields, e.g. `Family Plan` + `plan@example.com`)

**Test SMTP** sends to the admin address. If SMTP is disabled, messages are recorded in the email
log with status `skipped`; failures show the SMTP error.

## The whole reminder schedule

There are exactly **two** reminder events:

1. **Advance notice — 7 days before due or expiry** (editable)
   - Member: one email for an unpaid invoice, or one renewal email when `paid_through` ends.
   - Admin: one summary listing everything inside the advance window.
   - Sent once per invoice / per renewal (`advance-invoice:<id>`, `advance-renewal:<user>:<date>`),
     so rerunning the job does not spam.
2. **Late notice — 1 day after the due date** (editable)
   - Admin only, one email per invoice: “remove the seat or contact the member”.
   - No member overdue email, no repeated dunning.

There is no daily digest, no overdue cadence, and no separate removal-warning series.

## Other emails

| Kind | Trigger |
| --- | --- |
| `invite` | Admin creates an invite with an email address |
| `advance` / `renewal-notice` | 7-day advance notice to the member |
| `admin-advance` | Same day, one summary to the admin |
| `admin-late` | 1 day past due, per invoice, to the admin |
| `receipt` | Payment confirmed |
| `storage-alert` / `storage-alert-admin` | Over-quota member / daily admin summary |

## Scheduler

The daily job runs inside the container every 6 hours (editable under Application settings). It:

1. Marks overdue invoices (awaiting only, never `submitted`).
2. Refreshes the USD→CNY rate once per day.
3. Sends the advance notices and the late admin notices.
4. Checks storage and sends over-quota alerts.

No external cron is required. **Admin → Overview → Run daily jobs** triggers it manually.

## Settings

Settings → Reminders:

- **Advance notice (days before due or expiry)** — default 7.
- **Late notice (days after due)** — default 1.
- Enable/disable both.

Settings → Plan & pricing still controls the **payment due window** (invoice due date = issue +
N days).

## Email log

Settings shows the last 12 messages with recipient, kind, status and SMTP error. Check it first
when someone says they did not receive an email.
