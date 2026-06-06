"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { createCheckoutForApplication } from "@/lib/checkout";

export async function addApplicationAction(formData: FormData) {
  const user = await requireUser();
  const universityId = String(formData.get("universityId") ?? "");
  if (!universityId) return;

  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);

  await db.application.upsert({
    where: { applicantId_universityId: { applicantId: applicant.id, universityId } },
    update: {},
    create: { applicantId: applicant.id, universityId, status: "DRAFT" },
  });
  revalidatePath("/dashboard");
}

export async function startCheckoutAction(formData: FormData) {
  const user = await requireUser();
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return;

  const result = await createCheckoutForApplication(user, applicationId);
  if (result.alreadyUnlocked) {
    revalidatePath("/dashboard");
    return;
  }
  if (result.checkoutUrl) redirect(result.checkoutUrl);
  // If billing isn't configured, surface nothing destructive; dashboard shows state.
  revalidatePath("/dashboard");
}

/**
 * DEV ONLY: unlock an application without paying, for local testing of autofill.
 * Disabled in production.
 */
export async function devUnlockAction(formData: FormData) {
  if (process.env.NODE_ENV === "production") return;
  const user = await requireUser();
  const applicationId = String(formData.get("applicationId") ?? "");
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: { applicantId: true },
  });
  if (!application) return;

  await db.entitlement.upsert({
    where: { applicationId },
    update: { status: "PAID" },
    create: {
      applicantId: application.applicantId,
      applicationId,
      status: "PAID",
      priceCents: 0,
      basePriceCents: 0,
      discountBps: 0,
    },
  });
  revalidatePath("/dashboard");
}
