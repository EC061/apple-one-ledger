/**
 * Optional in-process scheduler.
 *
 * Runs the daily job every 6 hours inside the container. Reminder keys make
 * repeated runs harmless. There is no external cron requirement.
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

  const { getSettings } = await import("./lib/settings");
  const hours = Math.max(1, Math.min(getSettings().app.schedulerHours || 6, 168));
  const interval = setInterval(run, hours * 60 * 60 * 1000);
  if (typeof interval.unref === "function") interval.unref();
}
