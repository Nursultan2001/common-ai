"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server-auth";

// Agencies (COUNSELOR) and admins create client records. Each client is an
// Applicant owned by the counselor, under their org, with an intake token that
// powers a no-login fill-out link the agency shares with the student.
export async function createClientAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "COUNSELOR" && user.role !== "ADMIN") return;

  const name = String(formData.get("clientName") ?? "").trim();
  if (!name) return;

  await db.applicant.create({
    data: {
      ownerUserId: user.id,
      orgId: user.orgId ?? null,
      intakeToken: randomUUID().replace(/-/g, ""),
      intakeClientName: name,
    },
  });
  revalidatePath("/dashboard/clients");
}

// Issue a fresh token (invalidates the old link) — e.g. if a link leaked.
export async function regenerateClientLinkAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("applicantId") ?? "");
  const a = await db.applicant.findUnique({ where: { id } });
  if (!a) return;
  const allowed =
    user.role === "ADMIN" || (a.orgId && a.orgId === user.orgId) || a.ownerUserId === user.id;
  if (!allowed) return;
  await db.applicant.update({
    where: { id },
    data: { intakeToken: randomUUID().replace(/-/g, "") },
  });
  revalidatePath("/dashboard/clients");
}
