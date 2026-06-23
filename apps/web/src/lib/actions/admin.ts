"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

const ROLES = ["STUDENT", "COUNSELOR", "ADMIN"];

// Change a user's role (STUDENT individual / COUNSELOR agency / ADMIN).
export async function setUserRoleAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !ROLES.includes(role)) return;
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin");
}

// Assign (or clear) a user's agency/org.
export async function setUserOrgAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  if (!userId) return;
  await db.user.update({ where: { id: userId }, data: { orgId: orgId || null } });
  revalidatePath("/admin");
}

// Create an agency/org. Discount is entered as a percent, stored as basis points.
export async function createOrgAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "AGENCY");
  const pct = Number(formData.get("discountPct") ?? 0);
  const discountBps = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) * 100 : 0;
  await db.org.create({ data: { name, type: type === "SCHOOL" ? "SCHOOL" : "AGENCY", discountBps } });
  revalidatePath("/admin");
}

// Give / remove an agency's access (active flag).
export async function toggleOrgActiveAction(formData: FormData) {
  await requireAdmin();
  const orgId = String(formData.get("orgId") ?? "");
  const org = await db.org.findUnique({ where: { id: orgId } });
  if (!org) return;
  await db.org.update({ where: { id: orgId }, data: { active: !org.active } });
  revalidatePath("/admin");
}
