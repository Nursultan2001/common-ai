import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// Stripe sends the raw body; we must verify the signature against it.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `signature verification failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      payment_intent: string | null;
      metadata: { applicationId?: string; entitlementPaymentId?: string };
    };
    const applicationId = session.metadata.applicationId;
    const paymentId = session.metadata.entitlementPaymentId;

    if (applicationId && paymentId) {
      // Mark payment succeeded + unlock the application's entitlement.
      await db.$transaction([
        db.payment.update({
          where: { id: paymentId },
          data: {
            status: "SUCCEEDED",
            stripePaymentIntentId: session.payment_intent ?? undefined,
          },
        }),
        db.entitlement.update({
          where: { applicationId },
          data: { status: "PAID" },
        }),
        db.auditEvent.create({
          data: {
            action: "ENTITLEMENT_GRANTED",
            meta: JSON.stringify({ applicationId, paymentId, stripeSessionId: session.id }),
          },
        }),
      ]);
    }
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as { payment_intent: string | null };
    if (charge.payment_intent) {
      const payment = await db.payment.findUnique({
        where: { stripePaymentIntentId: charge.payment_intent },
        include: { entitlements: true },
      });
      if (payment) {
        await db.$transaction([
          db.payment.update({
            where: { id: payment.id },
            data: { status: "REFUNDED" },
          }),
          db.entitlement.updateMany({
            where: { paymentId: payment.id },
            data: { status: "REFUNDED" },
          }),
        ]);
      }
    }
  }

  return NextResponse.json({ received: true });
}
