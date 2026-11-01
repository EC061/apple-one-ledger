import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Kept so old links keep working; the rules now live on the landing page. */
export default function AboutPage() {
  redirect("/#how-it-works");
}
