/**
 * Optional in-process scheduler.
 *
 * Set INTERNAL_SCHEDULER=true to run the daily job roughly every 6 hours
 * without an external cron. All work is deduplicated (reminder keys, digests),
 * so running it more often than daily is harmless.
 *
 * For production, prefer the external trigger:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/daily
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.INTERNAL_SCHEDULER !== "true") return;

  const store = globalThis as unknown as { __a1Scheduler?: boolean };
  if (store.__a1Scheduler) return;
  store.__a1Scheduler = true;

  const run = async () => {
    try {
      const { runDailyJobs } = await import("./lib/reminders");
      const result = await runDailyJobs();
      console.log("[scheduler] daily jobs", result);
    } catch (error) {
      console.error("[scheduler] daily jobs failed", error);
    }
  };

  const first = setTimeout(run, 45_000);
  if (typeof first.unref === "function") first.unref();

  const interval = setInterval(run, 6 * 60 * 60 * 1000);
  if (typeof interval.unref === "function") interval.unref();
}
