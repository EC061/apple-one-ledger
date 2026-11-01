# iCloud probe (unsupported)

Answers one question with evidence: **do `getFamilyDetails` and `storageUsageInfo` return
per-member storage?**

Run it against your own organizer account. It prints the raw JSON, then tries `dsid` variants
and a few guessed family-storage paths.

```bash
cd contrib/icloud-probe
uv run probe.py --username you@example.com
```

Optional: send whatever it finds to your ledger.

```bash
uv run probe.py --username you@example.com \
  --post-to https://plan.example.com --token "$STORAGE_TOKEN"
```

## What the two endpoints actually return

From the `pyicloud` implementation (`pyicloud/services/account.py`):

| Endpoint | Payload | Per-member usage? |
| --- | --- | --- |
| `setup/web/family/getFamilyDetails` | `familyMembers[]`: `dsid`, `fullName`, `appleId`, `hasParentalPrivileges`, … | **No** — identity and family metadata only |
| `setup/ws/1/storageUsageInfo` | `storageUsageInfo` (total/used/available bytes), `quotaStatus`, `storageUsageByMedia[]` | **No** — the signed-in account's aggregate, by media type |

So they are useful for two things: confirming which Apple IDs are in the family, and reading the
organizer's total used/available bytes. Neither exposes "Sam used 342 GB".

If the probe ever does find a per-member field (Apple changes the private API), `--post-to`
maps `dsid → Apple ID email` and posts to `/api/storage/observations`, which is the same path a
Shortcut uses.

## Risks — read before running

- Apple's iCloud terms prohibit automated access to the service. This probe may violate them.
- It requires the organizer's password plus 2FA, and leaves session cookies in `--cookie-dir`
  (default `~/.pyicloud`). Treat that directory like a password.
- Sessions expire; password changes, Advanced Data Protection, trusted-device prompts, region
  (GCBD / iCloud China), and rate limits can all break it.
- Repeated automated logins can lock the Apple ID. Do not schedule this.
- This is **not** shipped in the Docker image and the app never calls these endpoints. It is a
  manual experiment, not a supported integration.

If the result is what the source suggests (identities + aggregate only), keep using manual entry
or the screenshot → Shortcut → `/api/storage/observations` flow documented in the main README.
