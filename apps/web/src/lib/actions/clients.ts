"use server";

import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, ACTIVE_CLIENT_COOKIE } from "@/lib/server-auth";

async function canManage(userId: string, role: string, orgId: string | null, applicantId: string) {
  const a = await db.applicant.findUnique({ where: { id: applicantId } });
  if (!a) return false;
  return role === "ADMIN" || a.ownerUserId === userId || (!!a.orgId && a.orgId === orgId);
}

// Agencies/admins "manage" a client: set the active-client cookie so every
// dashboard page/action edits THAT client's application, then open the editor.
export async function manageClientAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "COUNSELOR" && user.role !== "ADMIN") return;
  const id = String(formData.get("applicantId") ?? "");
  if (!(await canManage(user.id, user.role, user.orgId, id))) return;
  cookies().set(ACTIVE_CLIENT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard/profile");
}

// Stop managing a client and return to the client list.
export async function exitClientAction() {
  cookies().delete(ACTIVE_CLIENT_COOKIE);
  redirect("/dashboard/clients");
}

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
