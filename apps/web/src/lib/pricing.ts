// Per-application pricing with agency discounts.
// Base price is $5.00 (500 cents). Agencies get a discount in basis points.

export const BASE_PRICE_CENTS = Number(
  process.env.STRIPE_PRICE_PER_APPLICATION_CENTS ?? 500
);

export interface PriceQuote {
  basePriceCents: number;
  discountBps: number;
  discountCents: number;
  priceCents: number; // final amount to charge
}

/**
 * Compute the price for one university application unlock.
 * @param discountBps basis points off the base price (1000 = 10%). Clamped 0..10000.
 */
export function quotePrice(discountBps = 0): PriceQuote {
  const bps = Math.max(0, Math.min(10000, Math.floor(discountBps)));
  const discountCents = Math.round((BASE_PRICE_CENTS * bps) / 10000);
  const priceCents = Math.max(0, BASE_PRICE_CENTS - discountCents);
  return {
    basePriceCents: BASE_PRICE_CENTS,
    discountBps: bps,
    discountCents,
    priceCents,
  };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
