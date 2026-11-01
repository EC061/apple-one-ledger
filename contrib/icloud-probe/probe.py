#!/usr/bin/env python3
"""
UNSUPPORTED EXPERIMENT. Not part of the web app, not used by the container.

Checks what the undocumented iCloud endpoints actually return for YOUR account:

  GET https://setup.icloud.com/setup/web/family/getFamilyDetails
  GET https://setup.icloud.com/setup/ws/1/storageUsageInfo

It prints the raw payloads, tries a few `dsid` variants, and looks for any
per-member storage field. If it finds one, `--post-to` can send the readings to
your ledger's /api/storage/observations endpoint.

Credentials never leave this process except to Apple. pyicloud stores session
cookies in --cookie-dir (default ~/.pyicloud) so you do not re-enter 2FA each run.

Risk: this violates the iCloud terms' ban on automated access, can trigger 2FA
prompts, and can lock the Apple ID. Use a throwaway probe only if you accept
that. The app itself never calls these endpoints.
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from pyicloud import PyiCloudService

FAMILY_URL = "https://setup.icloud.com/setup/web/family/getFamilyDetails"
STORAGE_URL = "https://setup.icloud.com/setup/ws/1/storageUsageInfo"
GUESSES = [
    "https://setup.icloud.com/setup/web/family/getFamilyStorageUsage",
    "https://setup.icloud.com/setup/web/family/getFamilyUsage",
    "https://setup.icloud.com/setup/web/family/getFamilyStorage",
]


def login(username: str, cookie_dir: str) -> PyiCloudService:
    password = getpass.getpass(f"Apple ID password for {username}: ")
    api = PyiCloudService(username, password, cookie_directory=cookie_dir)

    if api.requires_2fa:
        code = input("Two-factor code: ").strip()
        if not api.validate_2fa_code(code):
            sys.exit("2FA validation failed.")
        if not api.is_trusted_session:
            api.trust_session()
    elif getattr(api, "requires_2sa", False):
        devices = api.trusted_devices
        for index, device in enumerate(devices):
            print(f"  [{index}] {device.get('deviceName', 'SMS')} {device.get('phoneNumber', '')}")
        choice = int(input("Device number: "))
        device = devices[choice]
        if not api.send_verification_code(device):
            sys.exit("Could not send the verification code.")
        code = input("Verification code: ").strip()
        if not api.validate_verification_code(device, code):
            sys.exit("Verification failed.")

    return api


def fetch(api: PyiCloudService, url: str, extra: dict | None = None):
    params = dict(getattr(api, "params", {}) or {})
    if extra:
        params.update(extra)
    try:
        response = api.session.get(url, params=params, timeout=30)
    except Exception as error:  # noqa: BLE001 - probe prints the failure
        return 0, f"request failed: {error}"

    try:
        return response.status_code, response.json()
    except ValueError:
        return response.status_code, response.text[:1500]


def find_member_usage(payload) -> dict[str, dict[str, float]]:
    """Look for dicts that carry a dsid plus something that looks like usage."""
    found: dict[str, dict[str, float]] = {}

    def visit(node):
        if isinstance(node, dict):
            dsid = node.get("dsid") or node.get("DSID") or node.get("memberId")
            if dsid:
                for key, value in node.items():
                    lowered = key.lower()
                    if isinstance(value, (int, float)) and (
                        "storage" in lowered or "bytes" in lowered or "usage" in lowered
                    ):
                        found.setdefault(str(dsid), {})[key] = value
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    visit(payload)
    return found


def family_rows(payload) -> list[dict]:
    if isinstance(payload, dict):
        members = payload.get("familyMembers") or []
        if isinstance(members, list):
            return [m for m in members if isinstance(m, dict)]
    return []


def bytes_to_gb(key: str, value: float) -> float:
    return value / 1_000_000_000 if "byte" in key.lower() else value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True, help="Apple ID email")
    parser.add_argument("--cookie-dir", default=str(Path.home() / ".pyicloud"))
    parser.add_argument("--out", help="write raw JSON payloads here")
    args = parser.parse_args()

    api = login(args.username, args.cookie_dir)

    print("\n== getFamilyDetails ==")
    family_status, family = fetch(api, FAMILY_URL)
    print(f"HTTP {family_status}")
    print(json.dumps(family, indent=2)[:4000] if isinstance(family, dict) else family)

    print("\n== storageUsageInfo (account aggregate) ==")
    storage_status, storage = fetch(api, STORAGE_URL)
    print(f"HTTP {storage_status}")
    print(json.dumps(storage, indent=2)[:4000] if isinstance(storage, dict) else storage)

    members = family_rows(family)
    findings = find_member_usage(family) | find_member_usage(storage)

    print("\n== per-member probe ==")
    for member in members:
        dsid = str(member.get("dsid") or "")
        name = member.get("fullName") or member.get("appleId") or dsid
        print(f"- {name} (dsid {dsid or '?'})")
        for extra in ({"dsid": dsid}, {"memberId": dsid}):
            status, body = fetch(api, STORAGE_URL, extra)
            hit = find_member_usage(body)
            if hit:
                findings.update(hit)
                print(f"    variant {extra} -> HTTP {status}, usage keys: {sorted(hit.get(dsid, {}))}")
                break
        else:
            print("    no per-member usage returned")

    print("\n== guessed family-storage endpoints ==")
    for url in GUESSES:
        status, body = fetch(api, url)
        print(f"- {url.split('/')[-1]}: HTTP {status}")
        findings.update(find_member_usage(body))

    if args.out:
        Path(args.out).write_text(json.dumps({"family": family, "storage": storage}, indent=2))
        print(f"\nraw payloads written to {args.out}")

    print("\n== verdict ==")
    usable = {
        dsid: {k: bytes_to_gb(k, v) for k, v in values.items()}
        for dsid, values in findings.items()
        if values
    }
    if not usable:
        print(
            "No per-member storage field was found. These endpoints give family identities\n"
            "and the signed-in account's aggregate usage, not each member's GB.\n"
            "Keep using manual entry or the screenshot/Shortcut observation flow."
        )
        return

    print("Found candidate per-member values:")
    print(json.dumps(usable, indent=2))


if __name__ == "__main__":
    main()
