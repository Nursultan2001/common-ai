"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import { canAccessApplicant } from "@/lib/auth";

export async function addLanguageAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const proficiency = formData
    .getAll("proficiency")
    .map((v) => String(v).trim())
    .filter(Boolean)
    .join(", ");

  const count = await db.language.count({ where: { applicantId: applicant.id } });
  if (count >= 5) return; // Common App allows up to 5

  await db.language.create({
    data: { applicantId: applicant.id, order: count, name, proficiency: proficiency || null },
  });
  revalidatePath("/dashboard/profile");
}

export async function deleteLanguageAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("languageId") ?? "");
  const lang = await db.language.findUnique({ where: { id } });
  if (!lang || !(await canAccessApplicant(user, lang.applicantId))) return;
  await db.language.delete({ where: { id } });
  revalidatePath("/dashboard/profile");
}
