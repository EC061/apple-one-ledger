import { requireAdmin } from "@/lib/auth";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="page">
      <TopBar user={user} area="admin" />
      <main className="grow">
        <div className="container stack">{children}</div>
      </main>
      <footer className="footer">
        <div className="container row-between">
          <span>Apple One Ledger · admin</span>
          <span className="muted">All times in the plan timezone · data stored in SQLite (WAL)</span>
        </div>
      </footer>
    </div>
  );
}
