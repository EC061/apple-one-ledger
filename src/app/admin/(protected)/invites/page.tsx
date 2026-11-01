import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, today } from "@/lib/dates";
import { seatCapacity, seatsUsed } from "@/lib/auth";
import { getBaseUrl } from "@/lib/url";
import { createInviteAction, revokeInviteAction } from "@/app/actions/admin";
import { Empty, Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import CopyButton from "@/components/CopyButton";
import type { Invite } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const params = await searchParams;
  const settings = getSettings();
  const baseUrl = await getBaseUrl();
  const day = today(settings.plan.timezone);

  const invites = db()
    .prepare("SELECT * FROM invites ORDER BY created_at DESC LIMIT 100")
    .all() as unknown as Invite[];

  const active = invites.filter((invite) => !invite.used_at && !invite.revoked_at && (!invite.expires_at || invite.expires_at >= day));

  return (
    <>
      {params.created ? <Notice tone="ok">Invite created. Copy the link below, or send it by email.</Notice> : null}
      {params.error === "email" ? <Notice tone="error">Enter a valid email address for the invite.</Notice> : null}

      <div className="row-between">
        <div>
          <h1>Invites</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            One seat per invite · {seatCapacity() - seatsUsed()} open seat(s)
          </p>
        </div>
      </div>

      <div className="notice">
        Invite links are generated from the address you are using now:{" "}
        <span className="mono">{baseUrl}</span>. Set <span className="mono">APP_URL</span> in the environment to pin a
        canonical HTTPS address; otherwise the reverse proxy&apos;s <span className="mono">X-Forwarded-*</span> headers
        are used.
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Create an invite</h2>
            <span className="muted small">The link works once and expires automatically.</span>
          </div>
          <span className="badge badge-paid">{active.length} active</span>
        </div>
        <div className="card-body">
          <form action={createInviteAction} className="form-grid">
            <div className="field">
              <label className="label" htmlFor="label">
                Label
              </label>
              <input id="label" name="label" className="input" placeholder="e.g. Sam" />
            </div>
            <div className="field">
              <label className="label" htmlFor="email">
                Send by email (optional)
              </label>
              <input id="email" name="email" type="email" className="input" placeholder="sam@example.com" />
            </div>
            <div className="field">
              <label className="label" htmlFor="expiresDays">
                Expires in (days)
              </label>
              <input
                id="expiresDays"
                name="expiresDays"
                type="number"
                className="input"
                min={1}
                max={365}
                defaultValue={14}
              />
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <SubmitButton className="btn btn-primary" pending="Creating…">
                Create invite
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>All invites</h2>
        </div>
        {invites.length === 0 ? (
          <Empty>No invites yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Invite</th>
                  <th>Label</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const used = Boolean(invite.used_at);
                  const revoked = Boolean(invite.revoked_at);
                  const expired = Boolean(invite.expires_at && invite.expires_at < day);
                  const url = `${baseUrl}/join/${invite.code}`;
                  return (
                    <tr key={invite.code}>
                      <td>
                        <div className="mono strong">{invite.code}</div>
                        <div className="muted small mono" style={{ wordBreak: "break-all" }}>
                          {url}
                        </div>
                      </td>
                      <td className="small">{invite.label ?? <span className="muted">—</span>}</td>
                      <td>
                        {used ? (
                          <span className="badge badge-void">Used</span>
                        ) : revoked ? (
                          <span className="badge badge-void">Revoked</span>
                        ) : expired ? (
                          <span className="badge badge-warn">Expired</span>
                        ) : (
                          <span className="badge badge-paid">Active</span>
                        )}
                        {invite.used_at ? (
                          <div className="muted small">{formatDateTime(invite.used_at, settings.plan.timezone)}</div>
                        ) : null}
                      </td>
                      <td className="small">{invite.expires_at ? formatDate(invite.expires_at) : "never"}</td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          {!used && !revoked ? <CopyButton value={url} label="Copy link" /> : null}
                          {!used && !revoked ? (
                            <form action={revokeInviteAction}>
                              <input type="hidden" name="code" value={invite.code} />
                              <SubmitButton className="btn btn-danger btn-sm" pending="…">
                                Revoke
                              </SubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
