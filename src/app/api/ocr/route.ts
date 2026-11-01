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
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * POST /api/ocr  (multipart form-data, field "image")
 *
 * Reads a WeChat / Alipay / Venmo / Zelle receipt screenshot with the system
 * tesseract binary and returns the raw text plus best-effort amount and
 * transaction id. The image is written to a temp file, read, and deleted.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Sign in first." }, 401);

  if (!rateLimit(`ocr:${user.id}`, 12, 60_000)) {
    return json({ ok: false, error: "Too many scans. Wait a minute and try again." }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Send the image as multipart form-data." }, 400);
  }

  const file = form.get("image");
  if (!(file instanceof File)) return json({ ok: false, error: "No image uploaded." }, 400);
  if (file.size === 0 || file.size > MAX_BYTES) {
    return json({ ok: false, error: "Image must be between 1 byte and 8 MB." }, 413);
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

  const dir = await mkdtemp(path.join(tmpdir(), "a1-ocr-"));
  const filePath = path.join(dir, "receipt");

  try {
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    const { stdout } = await run("tesseract", [filePath, "stdout", "-l", "eng", "--psm", "6"], {
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
    });

    const text = String(stdout || "").trim();
    if (!text) {
      return json({ ok: false, error: "No text found in that image. Try a tighter crop." }, 422);
    }

    return json({ ok: true, text: text.slice(0, 4000), parsed: parsePaymentText(text) });
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
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function GET() {
  return json({ ok: false, error: "POST an image as multipart form-data in the `image` field." }, 405);
}
