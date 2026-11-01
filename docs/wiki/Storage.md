# Storage

## Fair share

The plan includes **2 TB** of shared iCloud+ storage.

```
quota = storage.totalGb / storage.shareCount
```

Defaults: `2000 GB / 6 = 333 GB` per person. `shareCount` is independent of billing seats, so a
billing-only admin who is not in the Apple family can be excluded.

This is a **fair-share guideline**, not a hard cap: Apple does not partition the pool, and one
member using more simply leaves less for everyone else.

## Reporting usage

Usage is entered by hand: **Admin → Members → Save GB** on each member row. Every reading is
stored in `storage_readings` with source, actor and timestamp. The member dashboard, admin pool
and member table update immediately.

There is no storage API, Shortcut or scraper in this build. Apple publishes no family-storage API;
the organizer can only read it in Settings → Family → iCloud+ (or iCloud.com).

`contrib/icloud-probe` is an unsupported, read-only experiment that prints what the private
iCloud endpoints return for your account. It does not post data into the app.

## Alerts

- Member email when `usedGb > quota`, throttled to one per ISO week.
- One admin summary per day listing everyone over quota.
- Readings older than `maxAgeDays` (default 45) are shown as stale and never trigger email.
- Never-reported is shown as “not reported”, never as zero.

## Settings

Admin → Settings → Storage: total pool, people sharing, warn threshold, stale age, member/admin
notifications. The dashboard meter and the iCloud+ tile on the public page use the same numbers.
