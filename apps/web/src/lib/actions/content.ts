"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { canAccessApplicant } from "@/lib/auth";
import { polishActivity, polishHonor } from "@/lib/ai";

// ---- Activities ----

export async function addActivityAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const raw = String(formData.get("rawDescription") ?? "").trim();
  if (!raw) return;

  const gradeLevels = formData.getAll("gradeLevels").map(String).filter(Boolean).join(",");
  const timing = formData.getAll("timing").map(String).filter(Boolean).join(",");

  await db.activity.create({
    data: {
      applicantId: applicant.id,
      category: String(formData.get("category") ?? "") || null,
      position: String(formData.get("position") ?? "") || null,
      organization: String(formData.get("organization") ?? "") || null,
      gradeLevels: gradeLevels || null,
      timing: timing || null,
      hoursPerWeek: Number(formData.get("hoursPerWeek")) || null,
      weeksPerYear: Number(formData.get("weeksPerYear")) || null,
      rawDescription: raw,
    },
  });
  revalidatePath("/dashboard/activities");
}

export async function polishActivityAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("activityId") ?? "");
  const activity = await db.activity.findUnique({ where: { id } });
  if (!activity || !(await canAccessApplicant(user, activity.applicantId))) return;

  const result = await polishActivity({
    category: activity.category,
    position: activity.position,
    organization: activity.organization,
    rawDescription: activity.rawDescription,
  });

  await db.activity.update({
    where: { id },
    data: { polishedDescription: result.text, status: "DRAFTED" },
  });
  await db.auditEvent.create({
    data: {
      action: "AI_POLISH_ACTIVITY",
      userId: user.id,
      applicantId: activity.applicantId,
      meta: JSON.stringify({ activityId: id, missing: result.missing }),
    },
  });
  revalidatePath("/dashboard/activities");
}

// The student edits the polished text, then approves. Only APPROVED content is
// ever exposed to autofill.
export async function approveActivityAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("activityId") ?? "");
  const edited = String(formData.get("polishedDescription") ?? "").trim().slice(0, 150);
  const activity = await db.activity.findUnique({ where: { id } });
  if (!activity || !(await canAccessApplicant(user, activity.applicantId))) return;

  await db.activity.update({
    where: { id },
    data: { polishedDescription: edited || activity.polishedDescription, status: "APPROVED" },
  });
  revalidatePath("/dashboard/activities");
}

export async function deleteActivityAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("activityId") ?? "");
  const activity = await db.activity.findUnique({ where: { id } });
  if (!activity || !(await canAccessApplicant(user, activity.applicantId))) return;
  await db.activity.delete({ where: { id } });
  revalidatePath("/dashboard/activities");
}

// ---- Honors ----

export async function addHonorAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  await db.honor.create({
    data: {
      applicantId: applicant.id,
      title,
      level: String(formData.get("level") ?? "") || null,
      rawDescription: String(formData.get("rawDescription") ?? "").trim(),
    },
  });
  revalidatePath("/dashboard/honors");
}

export async function polishHonorAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("honorId") ?? "");
  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor || !(await canAccessApplicant(user, honor.applicantId))) return;

  const result = await polishHonor({
    title: honor.title,
    level: honor.level,
    rawDescription: honor.rawDescription,
  });
  await db.honor.update({
    where: { id },
    data: { polishedTitle: result.text, status: "DRAFTED" },
  });
  await db.auditEvent.create({
    data: {
      action: "AI_POLISH_HONOR",
      userId: user.id,
      applicantId: honor.applicantId,
      meta: JSON.stringify({ honorId: id, missing: result.missing }),
    },
  });
  revalidatePath("/dashboard/honors");
}

export async function approveHonorAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("honorId") ?? "");
  const edited = String(formData.get("polishedTitle") ?? "").trim().slice(0, 100);
  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor || !(await canAccessApplicant(user, honor.applicantId))) return;
  await db.honor.update({
    where: { id },
    data: { polishedTitle: edited || honor.polishedTitle || honor.title, status: "APPROVED" },
  });
  revalidatePath("/dashboard/honors");
}

export async function deleteHonorAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("honorId") ?? "");
  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor || !(await canAccessApplicant(user, honor.applicantId))) return;
  await db.honor.delete({ where: { id } });
  revalidatePath("/dashboard/honors");
}
