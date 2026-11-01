import { readFile } from "node:fs/promises";
import path from "node:path";
import { isUploadName, uploadDir, uploadMime } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Serves uploaded payment QR images from DATA_DIR/uploads. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isUploadName(name)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await readFile(path.join(uploadDir(), name));
    return new Response(data, {
      headers: {
        "content-type": uploadMime(name),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
