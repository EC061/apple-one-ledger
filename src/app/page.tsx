import Link from "next/link";
import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/dates";
import { PLANS, PLAN_ORDER, perSeatMonthly } from "@/lib/pricing";
import { dict, fill, getLang, type Copy } from "@/lib/i18n";
import { getTheme } from "@/lib/theme";
import { Brand } from "@/components/ui";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared family plan",
  description: "Cost-sharing ledger for a shared Apple One Premier + AppleCare One family plan.",
};


export default async function HomePage() {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  const settings = getSettings();
  const t = dict[lang];
  const seatCost = perSeatMonthly(settings.pricing, settings.plan.seats);
  const quota = Math.floor(settings.storage.totalGb / Math.max(settings.storage.shareCount, 1));

  return (
    <div className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand />
          <div className="topbar-right">
            <LanguageToggle lang={lang} />
            <ThemeToggle theme={theme} labels={{ light: t.themeToLight, dark: t.themeToDark }} />
            <Link href="/login" className="btn btn-ghost btn-sm">
              {t.signIn}
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              {t.signUp}
            </Link>
          </div>
        </div>
      </header>

      <main className="grow">
        <Hero t={t} seats={settings.plan.seats} planName={settings.plan.name} quota={quota} />
        <div className="container stack" style={{ paddingBottom: 56 }}>
          <ServicesSection t={t} services={settings.plan.services} quota={quota} shareCount={settings.storage.shareCount} />
          <PricingSection t={t} pricing={settings.pricing} />
          <CostBasis t={t} pricing={settings.pricing} seats={settings.plan.seats} seatCost={seatCost} />
          <RulesSection
            t={t}
            grace={settings.plan.graceDays}
            dueDays={settings.plan.dueSoonDays}
            advanceDays={settings.reminders.advanceDays}
          />
          <PaymentsSection t={t} />
          <InfoCards t={t} pool={settings.storage.totalGb} shareCount={settings.storage.shareCount} quota={quota} seats={settings.plan.seats} />
        </div>
      </main>

      <footer className="footer">
        <div className="container row-between">
          <span>
            {settings.plan.name} · {settings.plan.seats} seats
          </span>
          <span className="muted">
            <Link href="#how-it-works">{t.navHow}</Link> ·{" "}
            <Link href="/login">{t.signIn}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Hero({ t, seats, planName, quota }: { t: Copy; seats: number; planName: string; quota: number }) {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <span className="eyebrow">{fill(t.eyebrow, { seats })}</span>
          <h1>{fill(t.h1, { seats })}</h1>
          <p className="lede">{fill(t.lede, { plan: planName, seats })}</p>
          <div className="row">
            <Link href="/signup" className="btn btn-primary">
              {t.signUp}
            </Link>
            <Link href="/login" className="btn btn-secondary">
              {t.signIn}
            </Link>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="sub-card">
            <span className="sub-kicker">01</span>
            <strong>{t.groupOne}</strong>
            <span className="sub-note">{t.groupOneNote}</span>
            <span className="sub-quota">{fill(t.icloudNote, { gb: quota })}</span>
          </div>
          <div className="sub-card sub-card-alt">
            <span className="sub-kicker">02</span>
            <strong>{t.groupTwo}</strong>
            <span className="sub-note">{t.groupTwoNote}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServicesSection({
  t,
  services,
  quota,
  shareCount,
}: {
  t: Copy;
  services: string[];
  quota: number;
  shareCount: number;
}) {
  const appleOne = services.filter((name) => !/applecare/i.test(name));
  const appleCare = services.filter((name) => /applecare/i.test(name));

  return (
    <section id="services" className="stack">
      <div>
        <h2>{t.servicesTitle}</h2>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {fill(t.servicesSub, { n: services.length })}
        </p>
      </div>

      <div className="service-group">
        <div className="group-head">
          <h3>{t.groupOne}</h3>
          <span className="muted small">{t.groupOneNote}</span>
        </div>
        <div className="services-grid">
          {appleOne.map((name) => (
            <div key={name} className="service-tile">
              <div className="service-name">{name}</div>
            </div>
          ))}
          <div className="service-tile service-icloud">
            <div className="row-between">
              <div>
                <div className="service-name">{t.icloudName}</div>
                <div className="service-note">{fill(t.icloudNote, { gb: quota })}</div>
              </div>
              <span className="pill">{quota} GB</span>
            </div>
            <div className="segbar" aria-label={t.icloudBar}>
              {Array.from({ length: Math.min(Math.max(shareCount, 1), 12) }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {appleCare.length ? (
        <div className="service-group">
          <div className="group-head">
            <h3>{t.groupTwo}</h3>
            <span className="muted small">{t.groupTwoNote}</span>
          </div>
          <div className="services-grid">
            {appleCare.map((name) => (
              <div key={name} className="service-tile">
                <div className="service-name">{name}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PricingSection({ t, pricing }: { t: Copy; pricing: ReturnType<typeof getSettings>["pricing"] }) {
  return (
    <section id="pricing" className="stack">
      <div>
        <h2>{t.pricingTitle}</h2>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {t.pricingSub}
        </p>
      </div>
      <div className="price-grid">
        {PLAN_ORDER.map((key, index) => {
          const months = PLANS[key].months;
          const first = pricing.firstTerm[key];
          const renewal = pricing.renewal[key];
          return (
            <div key={key} className={`price-card ${index === 1 ? "featured" : ""}`}>
              <div className="price-name">{PLANS[key].label}</div>
              <div className="price-amount">
                {formatMoney(first)} <span>{t.firstTerm}</span>
              </div>
              <div className="price-month">{fill(t.perMonth, { amount: formatMoney(first / months) })}</div>
              <div className="price-note">{fill(t.months, { n: months })}</div>
              <div className="price-renew">
                {fill(t.renewal, { amount: formatMoney(renewal) })} ·{" "}
                {fill(t.perMonth, { amount: formatMoney(renewal / months) })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CostBasis({
  t,
  pricing,
  seats,
  seatCost,
}: {
  t: Copy;
  pricing: ReturnType<typeof getSettings>["pricing"];
  seats: number;
  seatCost: number;
}) {
  const quarterlyMonthly = pricing.firstTerm.quarterly / 3;

  return (
    <section className="card card-pad cost-grid">
      <div>
        <h2>{t.costTitle}</h2>
        <div className="cost-lines">
          <span>{t.costTotal}</span>
          <span className="value">{formatMoney(pricing.monthlyTotalUsd)}</span>
          <span>{t.costSeats}</span>
          <span className="value">{seats}</span>
          <span>{t.costPerSeat}</span>
          <span className="value strong">{formatMoney(seatCost)}</span>
          <span>{t.costQuarter}</span>
          <span className="value muted">{formatMoney(quarterlyMonthly)}</span>
        </div>
        <p className="hint" style={{ margin: "10px 0 0" }}>
          {fill(t.costNote, {
            quarter: formatMoney(pricing.firstTerm.quarterly),
            exact: formatMoney(seatCost),
          })}
        </p>
      </div>
      <div className="cost-figure">
        <div className="cost-total">{formatMoney(seatCost)}</div>
        <div className="muted small">{t.costPerSeat}</div>
      </div>
    </section>
  );
}

function RulesSection({ t, grace, dueDays, advanceDays }: { t: Copy; grace: number; dueDays: number; advanceDays: number }) {
  return (
    <section id="how-it-works" className="disclosure">
      <h3>{t.rulesTitle}</h3>
      <ul>
        {t.rules.map((rule) => (
          <li key={rule}>{fill(rule, { grace, dueDays, advanceDays })}</li>
        ))}
      </ul>
    </section>
  );
}

function PaymentsSection({ t }: { t: Copy }) {
  const methods = [
    { name: "WeChat Pay", currency: "CNY" },
    { name: "Alipay", currency: "CNY" },
    { name: "Venmo", currency: "USD" },
    { name: "Zelle", currency: "USD" },
  ];

  return (
    <section id="payments" className="stack">
      <div>
        <h2>{t.payTitle}</h2>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {t.paySub}
        </p>
      </div>
      <div className="grid grid-4">
        {methods.map((method) => (
          <div key={method.name} className="card card-pad">
            <h3>{method.name}</h3>
            <p className="muted small" style={{ marginBottom: 0 }}>
              {method.currency}
            </p>
          </div>
        ))}
      </div>
      <p className="hint">{t.payNote}</p>
    </section>
  );
}

function InfoCards({
  t,
  pool,
  shareCount,
  quota,
  seats,
}: {
  t: Copy;
  pool: number;
  shareCount: number;
  quota: number;
  seats: number;
}) {
  return (
    <section className="grid grid-3">
      <div className="card card-pad">
        <h3>{t.emailTitle}</h3>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {t.emailText}
        </p>
      </div>
      <div className="card card-pad">
        <h3>{t.storageTitle}</h3>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {fill(t.storageText, { pool, count: shareCount, gb: quota })}
        </p>
      </div>
      <div className="card card-pad">
        <h3>{t.accessTitle}</h3>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {fill(t.accessText, { seats })}
        </p>
      </div>
    </section>
  );
}
