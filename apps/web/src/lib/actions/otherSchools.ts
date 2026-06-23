"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import { canAccessApplicant } from "@/lib/auth";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : null;
}
function d(fd: FormData, k: string): Date | null {
  const v = s(fd, k);
  return v ? new Date(v) : null;
}

// Add another secondary/high school (Common App allows up to 3 extra).
export async function addOtherSchoolAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const name = s(formData, "name");
  if (!name) return;

  const count = await db.otherSchool.count({ where: { applicantId: applicant.id } });
  if (count >= 3) return; // Common App caps additional schools at 3

  await db.otherSchool.create({
    data: {
      applicantId: applicant.id,
      order: count,
      name,
      notListed: s(formData, "notListed") ?? "Yes",
      country: s(formData, "country"),
      type: s(formData, "type"),
      address1: s(formData, "address1"),
      address2: s(formData, "address2"),
      address3: s(formData, "address3"),
      city: s(formData, "city"),
      state: s(formData, "state"),
      zip: s(formData, "zip"),
      fromDate: d(formData, "fromDate"),
      toDate: d(formData, "toDate"),
      reasonLeft: s(formData, "reasonLeft"),
    },
  });
  revalidatePath("/dashboard/profile");
}

export async function updateOtherSchoolAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("schoolId") ?? "");
  const row = await db.otherSchool.findUnique({ where: { id } });
  if (!row || !(await canAccessApplicant(user, row.applicantId))) return;

  await db.otherSchool.update({
    where: { id },
    data: {
      name: s(formData, "name"),
      notListed: s(formData, "notListed") ?? "Yes",
      country: s(formData, "country"),
      type: s(formData, "type"),
      address1: s(formData, "address1"),
      address2: s(formData, "address2"),
      address3: s(formData, "address3"),
      city: s(formData, "city"),
      state: s(formData, "state"),
      zip: s(formData, "zip"),
      fromDate: d(formData, "fromDate"),
      toDate: d(formData, "toDate"),
      reasonLeft: s(formData, "reasonLeft"),
    },
  });
  revalidatePath("/dashboard/profile");
}

export async function deleteOtherSchoolAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("schoolId") ?? "");
  const row = await db.otherSchool.findUnique({ where: { id } });
  if (!row || !(await canAccessApplicant(user, row.applicantId))) return;
  await db.otherSchool.delete({ where: { id } });

  // Re-pack order so it stays 0..n-1 (the page reveals blocks by count).
  const rest = await db.otherSchool.findMany({
    where: { applicantId: row.applicantId },
    orderBy: { order: "asc" },
  });
  await Promise.all(
    rest.map((r, i) => db.otherSchool.update({ where: { id: r.id }, data: { order: i } }))
  );
  revalidatePath("/dashboard/profile");
}
