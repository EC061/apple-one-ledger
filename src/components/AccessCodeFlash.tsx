import { readAccessCodeFlash } from "@/lib/flash";
import CopyButton from "./CopyButton";
import ClearFlashCookie from "./ClearFlashCookie";

export default async function AccessCodeFlash({ label = "Your new access code" }: { label?: string }) {
  const code = await readAccessCodeFlash();
  if (!code) return null;

  return (
    <div className="notice notice-ok" style={{ marginBottom: 18 }}>
      <div className="row-between" style={{ gap: 12 }}>
        <div>
          <div className="strong" style={{ marginBottom: 4 }}>
            {label} — save it now
          </div>
          <div className="small">This is shown once. Use it to sign in on any device.</div>
        </div>
        <CopyButton value={code} label="Copy code" />
      </div>
      <div className="code-box" style={{ marginTop: 10, background: "#fff" }}>
        {code}
      </div>
      <ClearFlashCookie />
    </div>
  );
}
