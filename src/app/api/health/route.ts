import { db } from "@/lib/db";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    db().prepare("SELECT 1 AS ok").get();
    return json({ ok: true, database: "up", time: new Date().toISOString() });
  } catch (error) {
    return json({ ok: false, database: "down", error: (error as Error).message }, 503);
  }
}
