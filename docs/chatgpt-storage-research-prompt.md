# Prompt for ChatGPT (with web search) — automated iCloud storage tracking

Copy everything between the lines into ChatGPT with browsing/search enabled.

---

**Role:** You are a pragmatic systems engineer who has shipped self-hosted integrations against consumer cloud services. Research with live web search; do not rely on memory alone. Cite sources with URLs and dates.

**Context**

I run a small self-hosted web app (Next.js + SQLite, single Docker container) that manages cost-sharing for one 6-person Apple One Premier + AppleCare One family plan. The plan includes a 2 TB iCloud+ pool shared across 6 Apple IDs, so each person's fair share is about 333 GB. The app already tracks:

- who has paid for which billing term (quarterly / half-year / annual),
- invoices in USD with a locked USD→CNY rate,
- reminders and receipts by email,
- a per-member `usedGb` field with a per-seat quota and over-quota email alerts.

The missing piece is **automatic collection of each family member's iCloud storage usage**. Today the admin types the number in, or posts it to:

```
POST /api/storage/update
{ "email": "member@example.com", "usedGb": 342.5 }
```

**Question**

Is there any reliable, supportable way to read **per-member iCloud+ storage usage** for a family group automatically in 2026, without jailbreaking, phishing, or violating Apple's terms? If yes, give me an implementation plan. If no, say so plainly and give me the best realistic approximation.

**Investigate at least these avenues, and verify each with current sources**

1. **Apple public APIs** — iCloud/CloudKit, Family Sharing, Apple School/Business Manager, Apple ID / Sign in with Apple, any documented endpoint that exposes family storage. Is there anything an individual developer can call with an app-specific password or OAuth token?
2. **The organizer's own visibility** — what exactly can the family organizer see (iOS/macOS Settings → Family → iCloud+ / Storage), and is that data exposed anywhere machine-readable (local plist, CloudKit private DB, device backup, `defaults` domain, sysdiagnose)?
3. **icloud.com web endpoints** — the private `setup.icloud.com` / `www.icloud.com` APIs used by the web UI. Which endpoints return storage/family data? What authentication and 2FA hurdles exist? How brittle are they? What happens under Advanced Data Protection? What are the ToS implications?
4. **Shortcuts / iOS automation** — can a Personal Automation read the Family Sharing storage screen or the iCloud storage breakdown and POST it to my endpoint? Be specific about what Shortcuts can and cannot read (there is no "get family storage" action, but check for workarounds such as screenshot + on-device OCR).
5. **Email or notification parsing** — Apple sends "iCloud storage is almost full" / "storage full" emails to the account owner (and family members?). Can those be parsed to infer usage or at least to trigger a warning? What data do they actually contain (used GB? per-member breakdown? nothing?).
6. **MDM / Apple Business Manager / Apple Configurator** — do any managed-device APIs expose iCloud storage per user? Is that available to a family, or only to organizations?
7. **Third-party tools** — existing open-source projects, Home Assistant integrations, or commercial services that read family iCloud storage. Do any work today, and how?
8. **Anything I have missed** — e.g. device-side screen scraping via a companion app, TestFlight/private APIs, CloudKit sharing, family purchase sharing data.

**For every option, report**

- What it can actually read (per-member breakdown, total only, or nothing).
- Authentication required, and whether it survives 2FA, trusted-device prompts, and password changes.
- Reliability and expected breakage rate; what breaks it.
- Terms-of-service / App Store / legal risk.
- Effort to build (hours/days) and ongoing maintenance.
- Whether it works for a plan owner in the US with family members in another country (China), where WeChat/Alipay payments are also used.

**Then deliver**

1. A one-paragraph **verdict**: is fully automatic per-member tracking possible, partially possible, or not possible? Be blunt.
2. A **comparison table** of the viable options with columns: option, data available, auth, reliability, ToS risk, effort, verdict.
3. A **recommended architecture** for the app, including:
   - the ingestion endpoint shape (JSON body, auth, idempotency),
   - how often to poll or push,
   - how to handle quota changes when seats change,
   - what to display when data is stale,
   - alert thresholds and throttling,
   - failure/observability handling.
4. If the best option is a **manual or semi-manual workflow**, design the least-annoying version: a monthly 60-second admin checklist, a reminder email that asks for the number, or an iOS Shortcut that opens the right screen and posts a number the admin confirms. Include exact screens/paths to look at on iOS 26/macOS 26.
5. A **decision matrix**: "if you value reliability most → X; if you value zero manual work most → Y; if you refuse any ToS risk → Z".
6. Clearly mark anything you could not verify. Do not invent API endpoints — if a URL is not documented or observed, say so.

**Constraints for your answer**

- Assume the reader is a competent developer but not an Apple platform specialist.
- Prefer supported, boring solutions over clever hacks.
- If a hack is the only path, state the failure modes explicitly (2FA prompts, session expiry, ADP, region, rate limits, account lockout).
- Keep it under 1,200 words plus the table. Use headings and short bullets.

---
