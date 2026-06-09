"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}
function num(fd: FormData, k: string): number | null {
  const s = str(fd, k);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseDate(s: string | null): Date | null {
  return s ? new Date(s) : null;
}

export async function saveProfileAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);

  const dob = str(formData, "dateOfBirth");
  const data = {
    legalFirstName: str(formData, "legalFirstName"),
    middleName: str(formData, "middleName"),
    legalLastName: str(formData, "legalLastName"),
    suffix: str(formData, "suffix"),
    preferredName: str(formData, "preferredName"),
    dateOfBirth: dob ? new Date(dob) : null,
    birthCity: str(formData, "birthCity"),
    birthCountry: str(formData, "birthCountry"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    addressLine1: str(formData, "addressLine1"),
    addressLine2: str(formData, "addressLine2"),
    city: str(formData, "city"),
    state: str(formData, "state"),
    postalCode: str(formData, "postalCode"),
    country: str(formData, "country"),
    citizenship: str(formData, "citizenship"),
    citizenshipStatus: str(formData, "citizenshipStatus"),
    legalSex: str(formData, "legalSex"),
    highSchoolName: str(formData, "highSchoolName"),
    graduationYear: num(formData, "graduationYear"),
    dateOfEntry: parseDate(str(formData, "dateOfEntry")),
    graduationDate: parseDate(str(formData, "graduationDate")),
    classSize: num(formData, "classSize"),
    gpa: num(formData, "gpa"),
    gpaScale: num(formData, "gpaScale"),
    satTotal: num(formData, "satTotal"),
    actComposite: num(formData, "actComposite"),
    intendedMajor: str(formData, "intendedMajor"),
    highestDegree: str(formData, "highestDegree"),
    careerInterest: str(formData, "careerInterest"),
  };

  await db.masterProfile.upsert({
    where: { applicantId: applicant.id },
    update: data,
    create: { applicantId: applicant.id, ...data },
  });

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
}
