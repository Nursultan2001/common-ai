"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { canAccessApplicant } from "@/lib/auth";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : null;
}

// Parent 1 / Parent 2 are addressed by a fixed `order` (0 or 1).
export async function saveParentAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const order = Number(formData.get("order")) === 1 ? 1 : 0;

  const data = {
    relationship: s(formData, "relationship"),
    parentType: s(formData, "parentType"),
    isLiving: s(formData, "isLiving"),
    prefix: s(formData, "prefix"),
    firstName: s(formData, "firstName"),
    middleInitial: s(formData, "middleInitial"),
    lastName: s(formData, "lastName"),
    suffix: s(formData, "suffix"),
    formerLastName: s(formData, "formerLastName"),
    email: s(formData, "email"),
    phoneType: s(formData, "phoneType"),
    phoneCountryCode: s(formData, "phoneCountryCode"),
    phoneNumber: s(formData, "phoneNumber"),
    occupation: s(formData, "occupation"),
    occupationOther: s(formData, "occupationOther"),
    employmentStatus: s(formData, "employmentStatus"),
    educationLevel: s(formData, "educationLevel"),
    parentCollegeEmployment: s(formData, "parentCollegeEmployment"),
    parentInstitutionsAttended: s(formData, "parentInstitutionsAttended"),
    title: s(formData, "title"),
    employer: s(formData, "employer"),
  };

  await db.parent.upsert({
    where: { applicantId_order: { applicantId: applicant.id, order } },
    update: data,
    create: { applicantId: applicant.id, order, ...data },
  });
  revalidatePath("/dashboard/family");
}

// Household: marital status, with whom you live, whether you have children.
export async function saveHouseholdAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const data = {
    parentsMaritalStatus: s(formData, "parentsMaritalStatus"),
    permanentHomeWith: s(formData, "permanentHomeWith"),
    hasChildren: s(formData, "hasChildren"),
  };
  await db.masterProfile.upsert({
    where: { applicantId: applicant.id },
    update: data,
    create: { applicantId: applicant.id, ...data },
  });
  revalidatePath("/dashboard/family");
}

export async function addSiblingAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const first = s(formData, "firstName");
  const last = s(formData, "lastName");
  if (!first && !last) return;

  const count = await db.sibling.count({ where: { applicantId: applicant.id } });
  await db.sibling.create({
    data: {
      applicantId: applicant.id,
      order: count,
      firstName: first,
      lastName: last,
      ageOrGrade: s(formData, "ageOrGrade"),
      educationLevel: s(formData, "educationLevel"),
      degreeEarned: s(formData, "degreeEarned"),
      collegeName: s(formData, "collegeName"),
    },
  });
  revalidatePath("/dashboard/family");
}

export async function deleteSiblingAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("siblingId") ?? "");
  const sib = await db.sibling.findUnique({ where: { id } });
  if (!sib || !(await canAccessApplicant(user, sib.applicantId))) return;
  await db.sibling.delete({ where: { id } });
  revalidatePath("/dashboard/family");
}
