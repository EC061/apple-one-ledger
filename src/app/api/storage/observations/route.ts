import { z } from "zod";
import { after } from "next/server";
import { bearerAuthorized, json } from "@/lib/api";
import {
  checkStorage,
  recordObservation,
  StorageConflictError,
  StorageError,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const reading = z
  .object({
    memberId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    usedGb: z.number().min(0).max(1_000_000),
  })
  .refine((value) => value.memberId || value.email, { message: "memberId or email is required" });

const schema = z.object({
  observationId: z.string().min(8).max(80),
  observedAt: z.string().min(10),
  source: z.string().max(60).optional(),
  readings: z.array(reading).min(1).max(20),
});

/**
 * POST /api/storage/observations
 * Authorization: Bearer $STORAGE_TOKEN
 *
 * Batch contract for a Shortcut / OCR / script that reads the Family Sharing
 * iCloud+ screen once and submits every member at the same instant.
 *
 * {
 *   "observationId": "uuid",
 *   "observedAt": "2026-11-01T14:00:00Z",
 *   "source": "ios-shortcut-confirmed",
 *   "readings": [{ "email": "sam@example.com", "usedGb": 342.5 }]
 * }
 *
 * Idempotent by observationId: the same payload returns duplicate=true,
 * a different payload under the same id returns 409.
 */
export async function POST(request: Request) {
  const token = process.env.STORAGE_TOKEN;
  if (!bearerAuthorized(request, token)) {
    return json({ ok: false, error: "Unauthorized. STORAGE_TOKEN must be set and sent as a Bearer token." }, 401);
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

  try {
    const result = recordObservation(parsed.data, "api");
    if (result.applied > 0) {
      after(async () => {
        await checkStorage().catch(() => undefined);
      });
    }
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof StorageConflictError) {
      return json({ ok: false, error: error.message }, 409);
    }
    if (error instanceof StorageError) {
      return json({ ok: false, error: error.message }, 400);
    }
    throw error;
  }
}

export async function GET() {
  return json(
    {
      ok: false,
      error: "Use POST with a Bearer token. Body: { observationId, observedAt, readings: [{ email, usedGb }] }.",
    },
    405,
  );
}
