import type { Plan } from "./types";
import type { PricingSettings } from "./settings";

export interface PlanDefinition {
  id: Plan;
  label: string;
  months: number;
  cadence: string;
}

export const PLANS: Record<Plan, PlanDefinition> = {
  quarterly: { id: "quarterly", label: "Quarterly", months: 3, cadence: "every 3 months" },
  semiannual: { id: "semiannual", label: "Half-year", months: 6, cadence: "every 6 months" },
  annual: { id: "annual", label: "Annual", months: 12, cadence: "every 12 months" },
};

export const PLAN_ORDER: Plan[] = ["quarterly", "semiannual", "annual"];

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && value in PLANS;
}

/** Term 1 is the discounted first subscription; every later term is "renewal" pricing. */
export function priceFor(plan: Plan, termIndex: number, pricing: PricingSettings): number {
  const table = termIndex <= 1 ? pricing.firstTerm : pricing.renewal;
  return table[plan];
}

export function monthlyEquivalent(amountUsd: number, months: number): number {
  return amountUsd / months;
}

/** The advertised per-seat monthly share (89.94 / 6 = 14.99). */
export function perSeatMonthly(pricing: PricingSettings, seats: number): number {
  return pricing.monthlyTotalUsd / Math.max(seats, 1);
}

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newReference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `A1-${out}`;
}

export function normalizeReference(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export const REFERENCE_PATTERN = /\bA1-[A-HJ-NP-Z2-9]{6}\b/gi;
