import { cronAuthorized, json } from "@/lib/api";
import { runDailyJobs } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/daily  (GET also accepted for simple cron services)
 * Authorization: Bearer $CRON_SECRET   (or ?token=$CRON_SECRET)
 *
 * Marks overdue invoices, refreshes the FX rate, sends reminders/digests,
 * checks storage quotas and polls IMAP when enabled.
 */
async function run(request: Request) {
  if (!cronAuthorized(request, process.env.CRON_SECRET)) {
    return json({ ok: false, error: "Unauthorized. Set CRON_SECRET and send it as a Bearer token." }, 401);
  }
  const result = await runDailyJobs();
  return json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
