# Email and reminders

## SMTP

Configure under **Admin → Settings → Email**: host, port, implicit TLS, username, password, from
address. **Test SMTP** sends a message to the admin address. If SMTP is disabled, messages are
recorded in the email log with status `skipped` — nothing is silently lost.

## Templates

| Kind | Trigger |
| --- | --- |
| `invite` | Admin creates an invite with an email address |
| `invoice-created` | Invoice issued (amount, due date, reference) |
| `reminder` | 7 days before due (editable) |
| `overdue` | Past due, per overdue cadence |
| `removal-warning` | Past grace; repeats per removal cadence |
| `receipt` | Payment confirmed |
| `renewal-notice` | 7 days before `paid_through` (member) |
| `renewal-admin` | Same day, one summary to the admin |
| `digest` | Daily admin summary incl. past-grace list |
| `storage-alert` / `storage-alert-admin` | Over-quota member / daily admin summary |

Messages are deduplicated by a key stored in `emails`; the key is claimed atomically **before**
sending, and released if delivery fails. Member names and emails are HTML-escaped.

## Scheduler

The daily job runs inside the container every 6 hours (editable under Application settings). It:

1. Marks overdue invoices (awaiting only, never `submitted`).
2. Refreshes the USD→CNY rate once per day.
3. Sends invoice reminders, renewal notices, admin digest.
4. Checks storage and sends over-quota alerts.

No external cron is required. **Admin → Overview → Run daily jobs** triggers it manually.

## Timing defaults

- Reminder: **7 days before** the invoice due date.
- Invoice due: **7 days after issue**.
- Renewal notice: **7 days before** coverage ends.
- Grace: **1 day**; removal warning from one day late.
- Overdue/removal warnings: daily.

All timings are editable in Settings → Reminders / Plan & pricing.

## Email log

Settings shows the last 12 messages with recipient, kind, status and the SMTP error when one
occurred. Use it first when a member says they did not receive something.
