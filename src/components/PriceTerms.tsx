import { formatMoney } from "@/lib/dates";
import type { PricingSettings } from "@/lib/settings";

export function NextTermNotice({
  pricing,
  termIndex,
}: {
  pricing: PricingSettings;
  termIndex: number;
}) {
  if (termIndex <= 1) {
    return (
      <div className="disclosure">
        <h3>First-term pricing — read before paying</h3>
        <ul>
          <li>
            Your first term is a flat, introductory amount:{" "}
            <strong>{formatMoney(pricing.firstTerm.quarterly)}</strong> quarterly,{" "}
            <strong>{formatMoney(pricing.firstTerm.semiannual)}</strong> half-year,{" "}
            <strong>{formatMoney(pricing.firstTerm.annual)}</strong> annual.
          </li>
          <li>
            From the <strong>second term onward</strong> the price changes to{" "}
            <strong>{formatMoney(pricing.renewal.quarterly)}</strong> quarterly,{" "}
            <strong>{formatMoney(pricing.renewal.semiannual)}</strong> half-year,{" "}
            <strong>{formatMoney(pricing.renewal.annual)}</strong> annual.
          </li>
          <li>The invoice always states which price applies before you pay.</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="notice">
      This is a <strong>renewal term</strong>. Renewal prices apply:{" "}
      {formatMoney(pricing.renewal.quarterly)} quarterly · {formatMoney(pricing.renewal.semiannual)} half-year ·{" "}
      {formatMoney(pricing.renewal.annual)} annual.
    </div>
  );
}
