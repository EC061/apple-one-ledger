import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Join the plan" };

export const dynamic = "force-dynamic";

/**
 * Invite links still point here; the shared sign-in page handles creation with
 * the invite code prefilled.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/login?code=${encodeURIComponent(code.toUpperCase())}`);
}
