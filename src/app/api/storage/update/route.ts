import { z } from "zod";
import { bearerAuthorized, json } from "@/lib/api";
import { db, event } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { after } from "next/server";
import { checkStorage, StorageError, updateStorage } from "@/lib/storage";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    memberId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    usedGb: z.number().min(0).max(1_000_000),
  })
  .refine((value) => value.memberId || value.email, {
    message: "Provide memberId or email.",
  });

/**
 * POST /api/storage/update
 * Authorization: Bearer $INGEST_TOKEN
 *
 * Body: { "email": "sam@example.com", "usedGb": 410.5 }
 *    or { "memberId": "<uuid>", "usedGb": 410.5 }
 *
 * Apple does not expose a public API for family iCloud storage, so this
 * endpoint is the automation hook: feed it from a manual admin entry, a
 * phone shortcut, or a script that reads the Family Sharing screen.
 */
export async function POST(request: Request) {
  const token = process.env.STORAGE_TOKEN || process.env.INGEST_TOKEN;
  if (!bearerAuthorized(request, token)) {
    return json({ ok: false, error: "Unauthorized. Set STORAGE_TOKEN (or INGEST_TOKEN) and send it as a Bearer token." }, 401);
  }
  if (!getSettings().storage.enabled) {
    return json({ ok: false, error: "Storage tracking is disabled in settings." }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Body must be JSON." }, 400);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid payload.", issues: parsed.error.issues }, 400);
  }

  const { memberId, email, usedGb } = parsed.data;
  const user = (
    memberId
      ? db().prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(memberId)
      : db().prepare("SELECT * FROM users WHERE lower(email) = ? AND status = 'active'").get(email!.toLowerCase())
  ) as unknown as User | undefined;

  if (!user) return json({ ok: false, error: "Member not found." }, 404);

  let status;
  try {
    status = updateStorage(user.id, usedGb, "api", "api");
  } catch (error) {
    if (error instanceof StorageError) return json({ ok: false, error: error.message }, 400);
    throw error;
  }

  event("api", "storage.ingest", { userId: user.id, usedGb, over: status.over });

  // Alerts need SMTP; run them after the response so a slow mail server does
  // not hold the request open.
  after(async () => {
    await checkStorage().catch(() => undefined);
  });

  return json({
    ok: true,
    member: { id: user.id, name: user.name, email: user.email },
    usedGb: status.usedGb,
    quotaGb: Math.round(status.quotaGb * 100) / 100,
    percent: Math.round(status.percent * 10) / 10,
    over: status.over,
    reportedAt: status.updatedAt,
  });
}

export async function GET() {
  return json({
    ok: false,
    error: "Use POST with a Bearer token. See README → Storage automation.",
  }, 405);
}
