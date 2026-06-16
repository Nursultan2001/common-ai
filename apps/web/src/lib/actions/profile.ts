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
// Multi-checkbox values → comma-separated string (e.g. gender, pronouns).
function multi(fd: FormData, k: string): string | null {
  const vals = fd.getAll(k).map((v) => String(v).trim()).filter(Boolean);
  return vals.length ? vals.join(", ") : null;
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
    sharePreferredName: str(formData, "sharePreferredName"),
    hasFormerName: str(formData, "hasFormerName"),
    formerLastName: str(formData, "formerLastName"),
    dateOfBirth: dob ? new Date(dob) : null,
    birthCity: str(formData, "birthCity"),
    birthCountry: str(formData, "birthCountry"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    phoneType: str(formData, "phoneType"),
    phoneCountryCode: str(formData, "phoneCountryCode"),
    alternatePhone: str(formData, "alternatePhone"),
    alternatePhoneNumber: str(formData, "alternatePhoneNumber"),
    alternatePhoneCountryCode: str(formData, "alternatePhoneCountryCode"),
    addressLine1: str(formData, "addressLine1"),
    addressLine2: str(formData, "addressLine2"),
    city: str(formData, "city"),
    state: str(formData, "state"),
    postalCode: str(formData, "postalCode"),
    country: str(formData, "country"),
    citizenship: str(formData, "citizenship"),
    citizenshipStatus: str(formData, "citizenshipStatus"),
    yearsInUS: str(formData, "yearsInUS"),
    holdsUSVisa: str(formData, "holdsUSVisa"),
    intendsUSVisa: str(formData, "intendsUSVisa"),
    visaType: str(formData, "visaType"),
    gender: multi(formData, "gender"),
    legalSex: str(formData, "legalSex"),
    pronouns: multi(formData, "pronouns"),
    highSchoolName: str(formData, "highSchoolName"),
    graduationYear: num(formData, "graduationYear"),
    dateOfEntry: parseDate(str(formData, "dateOfEntry")),
    graduationDate: parseDate(str(formData, "graduationDate")),
    highSchoolNotListed: str(formData, "highSchoolNotListed"),
    highSchoolCountry: str(formData, "highSchoolCountry"),
    highSchoolType: str(formData, "highSchoolType"),
    highSchoolAddress1: str(formData, "highSchoolAddress1"),
    highSchoolAddress2: str(formData, "highSchoolAddress2"),
    highSchoolAddress3: str(formData, "highSchoolAddress3"),
    highSchoolCity: str(formData, "highSchoolCity"),
    highSchoolState: str(formData, "highSchoolState"),
    highSchoolZip: str(formData, "highSchoolZip"),
    isBoardingSchool: str(formData, "isBoardingSchool"),
    didGraduate: str(formData, "didGraduate"),
    progression: multi(formData, "progression"),
    classSize: num(formData, "classSize"),
    gpa: num(formData, "gpa"),
    gpaScale: num(formData, "gpaScale"),
    classRank: str(formData, "classRank"),
    classRankReporting: str(formData, "classRankReporting"),
    decileRank: str(formData, "decileRank"),
    quintileRank: str(formData, "quintileRank"),
    quartileRank: str(formData, "quartileRank"),
    rankWeighting: str(formData, "rankWeighting"),
    gpaWeighting: str(formData, "gpaWeighting"),
    satTotal: num(formData, "satTotal"),
    actComposite: num(formData, "actComposite"),
    intendedMajor: str(formData, "intendedMajor"),
    highestDegree: str(formData, "highestDegree"),
    careerInterest: str(formData, "careerInterest"),
    enrollmentPlan: str(formData, "enrollmentPlan"),
    feeWaiverEligible: str(formData, "feeWaiverEligible"),
    feeWaiverSignature: str(formData, "feeWaiverSignature"),
    ustriveMentor: str(formData, "ustriveMentor"),
  };

  await db.masterProfile.upsert({
    where: { applicantId: applicant.id },
    update: data,
    create: { applicantId: applicant.id, ...data },
  });

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
}
