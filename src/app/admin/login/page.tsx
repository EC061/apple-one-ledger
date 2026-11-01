import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Kept for old links: admin now signs in on the shared /login page. */
export default function AdminLoginPage() {
  redirect("/login");
}
