import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import NavLinks, { type NavItem } from "./NavLinks";
import type { User } from "@/lib/types";

export default function TopBar({ user, area }: { user: User; area: "member" | "admin" }) {
  const items: NavItem[] =
    area === "admin"
      ? [
          { href: "/admin", label: "Overview", exact: true },
          { href: "/admin/pool", label: "Pool" },
          { href: "/admin/members", label: "Members" },
          { href: "/admin/invoices", label: "Invoices" },
          { href: "/admin/invites", label: "Invites" },
          { href: "/admin/settings", label: "Settings" },
          { href: "/quick", label: "Quick" },
        ]
      : [{ href: "/dashboard", label: "Dashboard", exact: true }];

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link href={area === "admin" ? "/admin" : "/dashboard"} className="brand">
          <span className="brand-mark">A1</span>
          <span>Apple One Ledger</span>
        </Link>
        <NavLinks items={items} />
        <div className="topbar-right">
          {user.role === "admin" && area === "admin" ? null : (
            <span className="who">
              <strong>{user.name}</strong>
            </span>
          )}
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
