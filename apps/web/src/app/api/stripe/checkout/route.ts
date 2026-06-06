import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSessionUser } from "@/lib/auth";
import { createCheckoutForApplication } from "@/lib/checkout";

// Create a Stripe Checkout session to unlock one university application.
// Body: { applicationId }. Discount is resolved server-side from the applicant's
// org so the client can never tamper with the price.
const Body = z.object({ applicationId: z.string().min(1) });

export async function POST(req: Request) {
  const user = await resolveSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await createCheckoutForApplication(user, parsed.data.applicationId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  if (result.alreadyUnlocked) return NextResponse.json({ alreadyUnlocked: true });
  return NextResponse.json({
    checkoutUrl: result.checkoutUrl,
    priceCents: result.priceCents,
  });
}
