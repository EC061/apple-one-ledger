/**
 * Optional in-process scheduler.
 *
 * Runs the daily job every 6 hours inside the container. All work is
 * deduplicated (reminder keys, digests, storage alerts), so running it more
 * often than daily is harmless. There is no external cron requirement.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

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
