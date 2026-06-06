import { db } from "./db";
import { getStripe } from "./stripe";
import { quotePrice } from "./pricing";
import { resolveDiscountBps } from "./entitlements";
import { canAccessApplicant, type SessionUser } from "./auth";

export interface CheckoutResult {
  alreadyUnlocked?: boolean;
  checkoutUrl?: string;
  priceCents?: number;
  error?: string;
  status?: number;
}

/**
 * Create (or short-circuit) a Stripe Checkout session to unlock one university
 * application. Discount is resolved server-side from the applicant's org, so the
 * price can never be tampered with by the caller.
 */
export async function createCheckoutForApplication(
  user: Pick<SessionUser, "id" | "role" | "orgId">,
  applicationId: string
): Promise<CheckoutResult> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { error: "billing not configured", status: 503 };
  }

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { university: true, applicant: { select: { id: true, orgId: true } } },
  });
  if (!application) return { error: "not found", status: 404 };
  if (!(await canAccessApplicant(user, application.applicantId))) {
    return { error: "forbidden", status: 403 };
  }

  const existing = await db.entitlement.findUnique({
    where: { applicationId: application.id },
  });
  if (existing?.status === "PAID") return { alreadyUnlocked: true };

  const discountBps = await resolveDiscountBps(application.applicantId);
  const quote = quotePrice(discountBps);

  const payment = await db.payment.create({
    data: {
      payerUserId: user.id,
      orgId: application.applicant.orgId ?? undefined,
      amountCents: quote.priceCents,
      status: "PENDING",
    },
  });

  await db.entitlement.upsert({
    where: { applicationId: application.id },
    update: {
      status: "LOCKED",
      priceCents: quote.priceCents,
      basePriceCents: quote.basePriceCents,
      discountBps: quote.discountBps,
      paymentId: payment.id,
    },
    create: {
      applicantId: application.applicantId,
      applicationId: application.id,
      status: "LOCKED",
      priceCents: quote.priceCents,
      basePriceCents: quote.basePriceCents,
      discountBps: quote.discountBps,
      paymentId: payment.id,
    },
  });

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: quote.priceCents,
          product_data: {
            name: `Application unlock — ${application.university.name}`,
            description:
              quote.discountBps > 0
                ? `Includes agency discount (${quote.discountBps / 100}% off)`
                : undefined,
          },
        },
      },
    ],
    success_url: `${process.env.APP_URL}/dashboard?unlocked=${application.id}`,
    cancel_url: `${process.env.APP_URL}/dashboard?canceled=${application.id}`,
    metadata: { applicationId: application.id, entitlementPaymentId: payment.id },
  });

  await db.payment.update({
    where: { id: payment.id },
    data: { stripeSessionId: session.id },
  });

  return { checkoutUrl: session.url ?? undefined, priceCents: quote.priceCents };
}
