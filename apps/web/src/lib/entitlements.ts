import { db } from "./db";

/**
 * Server-enforced gate. The extension calls this (via /api/entitlements/check)
 * before unlocking autofill for a given application. No PAID entitlement => the
 * extension must keep autofill disabled. This is what makes the product
 * impossible to "steal": the valuable action is gated server-side per use, not
 * shipped as a file.
 */
export async function isApplicationUnlocked(
  applicationId: string
): Promise<boolean> {
  const ent = await db.entitlement.findUnique({
    where: { applicationId },
    select: { status: true },
  });
  return ent?.status === "PAID";
}

/**
 * Resolve the effective discount for an applicant: agency discount if the
 * applicant belongs to an active org, else none.
 */
export async function resolveDiscountBps(applicantId: string): Promise<number> {
  const applicant = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { org: { select: { discountBps: true, active: true } } },
  });
  if (applicant?.org?.active) return applicant.org.discountBps;
  return 0;
}
