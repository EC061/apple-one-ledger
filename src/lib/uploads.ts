import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MAX_BYTES = 5 * 1024 * 1024;

export function uploadDir(): string {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "uploads");
}

export function isUploadName(name: string): boolean {
  return /^[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(name);
}

export function uploadMime(name: string): string {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  return "image/jpeg";
}

/** Persist a QR image under DATA_DIR/uploads and return its public path. */
export async function saveQrUpload(file: File, slot: "wechat" | "alipay"): Promise<string> {
  const extension = ALLOWED[file.type];
  if (!extension) {
    throw new Error("QR code must be a PNG, JPG or WebP image.");
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    throw new Error("QR code must be between 1 byte and 5 MB.");
  }

  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const name = `${slot}-${Date.now()}-${randomBytes(4).toString("hex")}.${extension}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}
