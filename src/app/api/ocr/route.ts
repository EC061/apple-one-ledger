import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getCurrentUser, rateLimit } from "@/lib/auth";
import { json } from "@/lib/api";
import { parsePaymentText } from "@/lib/payment-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_CONCURRENT = 2;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

let active = 0;
let cachedLangs: string[] | null = null;

async function languages(): Promise<string> {
  if (cachedLangs) return cachedLangs.includes("chi_sim") ? "eng+chi_sim" : "eng";
  try {
    const { stdout } = await run("tesseract", ["--list-langs"], { timeout: 5000 });
    cachedLangs = String(stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("List"));
  } catch {
    cachedLangs = ["eng"];
  }
  return cachedLangs.includes("chi_sim") ? "eng+chi_sim" : "eng";
}

/**
 * POST /api/ocr  (multipart form-data, field "image")
 *
 * Reads a WeChat / Alipay / Venmo / Zelle receipt screenshot with tesseract and
 * returns the parsed amount/transaction id. The image is written to a temp
 * file, read, and deleted; OCR text is not echoed back or stored.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Sign in first." }, 401);

  if (!rateLimit(`ocr:${user.id}`, 12, 60_000)) {
    return json({ ok: false, error: "Too many scans. Wait a minute and try again." }, 429);
  }

  // Require a declared length so chunked bodies cannot bypass the size cap
  // before formData() buffers them.
  const length = Number(request.headers.get("content-length") || 0);
  if (!length) {
    return json({ ok: false, error: "Content-Length is required." }, 411);
  }
  if (length > MAX_BYTES + 128 * 1024) {
    return json({ ok: false, error: "That upload is too large (max 4 MB)." }, 413);
  }

  // Reserve the slot before any await, otherwise concurrent requests all pass
  // the check and spawn tesseract at once.
  if (active >= MAX_CONCURRENT) {
    return json({ ok: false, error: "Another scan is running. Try again in a moment." }, 429);
  }
  active += 1;

  let dir: string | null = null;
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, error: "Send the image as multipart form-data." }, 400);
    }

    const file = form.get("image");
    if (!(file instanceof File)) return json({ ok: false, error: "No image uploaded." }, 400);
    if (file.size === 0 || file.size > MAX_BYTES) {
      return json({ ok: false, error: "Image must be between 1 byte and 4 MB." }, 413);
    }
    if (!ALLOWED.has(file.type)) {
      return json(
        {
          ok: false,
          error: "Use a PNG, JPG or WebP screenshot. iPhone HEIC photos: take a screenshot instead, or share as JPEG.",
        },
        415,
      );
    }

    dir = await mkdtemp(path.join(tmpdir(), "a1-ocr-"));
    const filePath = path.join(dir, "receipt");
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    const lang = await languages();
    const { stdout } = await run("tesseract", [filePath, "stdout", "-l", lang, "--psm", "6"], {
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const parsed = parsePaymentText(String(stdout || "").trim());
    if (!parsed.amount && !parsed.txRef && !parsed.reference) {
      return json({ ok: false, error: "No amount or transaction number found. Try a tighter crop." }, 422);
    }

    return json({ ok: true, parsed });
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    console.error("[ocr] failed", error);
    return json(
      {
        ok: false,
        error: missing
          ? "OCR is not installed on the server. Install tesseract-ocr (see README)."
          : "Could not read that image. Try again or enter the details manually.",
      },
      missing ? 501 : 500,
    );
  } finally {
    active -= 1;
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function GET() {
  return json({ ok: false, error: "POST an image as multipart form-data in the `image` field." }, 405);
}
