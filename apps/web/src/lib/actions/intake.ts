"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { applicantIdFromToken, str, num, dateOf, multi } from "@/lib/intake";

// All actions are scoped by the intake token (the form is no-login). Each step
// writes only its own fields, so steps never clobber each other.

async function aid(fd: FormData): Promise<string | null> {
  return applicantIdFromToken(String(fd.get("token") ?? ""));
}
async function upsertProfile(applicantId: string, data: Record<string, unknown>) {
  await db.masterProfile.upsert({
    where: { applicantId },
    update: data,
    create: { applicantId, ...data },
  });
}
// Stay on the current step (used by add/delete sub-forms).
function stay(token: string) {
  revalidatePath(`/intake/${token}`);
}
// Save then advance to the next step (used by single-save steps).
function advance(token: string, step: string) {
  revalidatePath(`/intake/${token}`);
  redirect(`/intake/${token}?step=${step}`);
}

export async function saveIntakePersonal(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  await upsertProfile(id, {
    legalFirstName: str(fd, "legalFirstName"),
    middleName: str(fd, "middleName"),
    legalLastName: str(fd, "legalLastName"),
    suffix: str(fd, "suffix"),
    preferredName: str(fd, "preferredName"),
    sharePreferredName: str(fd, "sharePreferredName"),
    hasFormerName: str(fd, "hasFormerName"),
    formerLastName: str(fd, "formerLastName"),
    dateOfBirth: dateOf(fd, "dateOfBirth"),
    birthCity: str(fd, "birthCity"),
    birthCountry: str(fd, "birthCountry"),
    gender: multi(fd, "gender"),
    legalSex: str(fd, "legalSex"),
    pronouns: multi(fd, "pronouns"),
    armedForces: str(fd, "armedForces"),
    hispanicLatino: str(fd, "hispanicLatino"),
    raceEthnicity: multi(fd, "raceEthnicity"),
  });
  advance(String(fd.get("token")), "contact");
}

export async function saveIntakeContact(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  await upsertProfile(id, {
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    phoneType: str(fd, "phoneType"),
    phoneCountryCode: str(fd, "phoneCountryCode"),
    alternatePhone: str(fd, "alternatePhone"),
    alternatePhoneNumber: str(fd, "alternatePhoneNumber"),
    alternatePhoneCountryCode: str(fd, "alternatePhoneCountryCode"),
    addressLine1: str(fd, "addressLine1"),
    addressLine2: str(fd, "addressLine2"),
    city: str(fd, "city"),
    state: str(fd, "state"),
    postalCode: str(fd, "postalCode"),
    country: str(fd, "country"),
  });
  advance(String(fd.get("token")), "citizenship");
}

export async function saveIntakeCitizenship(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  await upsertProfile(id, {
    citizenship: str(fd, "citizenship"),
    citizenshipStatus: str(fd, "citizenshipStatus"),
    yearsInUS: str(fd, "yearsInUS"),
    holdsUSVisa: str(fd, "holdsUSVisa"),
    intendsUSVisa: str(fd, "intendsUSVisa"),
    visaType: str(fd, "visaType"),
  });
  advance(String(fd.get("token")), "languages");
}

export async function saveIntakeEducation(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  await upsertProfile(id, {
    highSchoolName: str(fd, "highSchoolName"),
    graduationYear: num(fd, "graduationYear"),
    dateOfEntry: dateOf(fd, "dateOfEntry"),
    graduationDate: dateOf(fd, "graduationDate"),
    classSize: num(fd, "classSize"),
    highSchoolNotListed: str(fd, "highSchoolNotListed") ?? "Yes",
    highSchoolCountry: str(fd, "highSchoolCountry"),
    highSchoolType: str(fd, "highSchoolType"),
    highSchoolAddress1: str(fd, "highSchoolAddress1"),
    highSchoolCity: str(fd, "highSchoolCity"),
    highSchoolState: str(fd, "highSchoolState"),
    highSchoolZip: str(fd, "highSchoolZip"),
    isBoardingSchool: str(fd, "isBoardingSchool"),
    didGraduate: str(fd, "didGraduate"),
    gpa: num(fd, "gpa"),
    gpaScale: num(fd, "gpaScale"),
    classRankReporting: str(fd, "classRankReporting"),
    rankWeighting: str(fd, "rankWeighting"),
    gpaWeighting: str(fd, "gpaWeighting"),
    intendedMajor: str(fd, "intendedMajor"),
    highestDegree: str(fd, "highestDegree"),
    careerInterest: str(fd, "careerInterest"),
    enrollmentPlan: str(fd, "enrollmentPlan"),
  });
  advance(String(fd.get("token")), "testing");
}

export async function saveIntakeHousehold(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  await upsertProfile(id, {
    parentsMaritalStatus: str(fd, "parentsMaritalStatus"),
    permanentHomeWith: str(fd, "permanentHomeWith"),
    hasChildren: str(fd, "hasChildren"),
  });
  stay(String(fd.get("token")));
}

export async function saveIntakeParent(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  const order = Number(fd.get("order")) === 1 ? 1 : 0;
  const data = {
    parentType: str(fd, "parentType"),
    isLiving: str(fd, "isLiving"),
    prefix: str(fd, "prefix"),
    firstName: str(fd, "firstName"),
    middleInitial: str(fd, "middleInitial"),
    lastName: str(fd, "lastName"),
    suffix: str(fd, "suffix"),
    email: str(fd, "email"),
    phoneType: str(fd, "phoneType"),
    phoneCountryCode: str(fd, "phoneCountryCode"),
    phoneNumber: str(fd, "phoneNumber"),
    occupation: str(fd, "occupation"),
    employmentStatus: str(fd, "employmentStatus"),
    educationLevel: str(fd, "educationLevel"),
  };
  await db.parent.upsert({
    where: { applicantId_order: { applicantId: id, order } },
    update: data,
    create: { applicantId: id, order, ...data },
  });
  stay(String(fd.get("token")));
}

export async function addIntakeSibling(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  const first = str(fd, "firstName");
  const last = str(fd, "lastName");
  if (!first && !last) return;
  const count = await db.sibling.count({ where: { applicantId: id } });
  await db.sibling.create({
    data: { applicantId: id, order: count, firstName: first, lastName: last, ageOrGrade: str(fd, "ageOrGrade") },
  });
  stay(String(fd.get("token")));
}
export async function deleteIntakeSibling(fd: FormData) {
  const id = await aid(fd);
  const sibId = String(fd.get("siblingId") ?? "");
  const sib = await db.sibling.findUnique({ where: { id: sibId } });
  if (!id || !sib || sib.applicantId !== id) return;
  await db.sibling.delete({ where: { id: sibId } });
  stay(String(fd.get("token")));
}

export async function addIntakeLanguage(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  const name = str(fd, "name");
  if (!name) return;
  const count = await db.language.count({ where: { applicantId: id } });
  if (count >= 5) return;
  await db.language.create({
    data: { applicantId: id, order: count, name, proficiency: multi(fd, "proficiency") },
  });
  stay(String(fd.get("token")));
}
export async function deleteIntakeLanguage(fd: FormData) {
  const id = await aid(fd);
  const langId = String(fd.get("languageId") ?? "");
  const lang = await db.language.findUnique({ where: { id: langId } });
  if (!id || !lang || lang.applicantId !== id) return;
  await db.language.delete({ where: { id: langId } });
  stay(String(fd.get("token")));
}

export async function saveIntakeTesting(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  const d = (k: string) => dateOf(fd, k);
  const data = {
    selfReportScores: str(fd, "selfReportScores"),
    internationalLeavingExam: str(fd, "internationalLeavingExam"),
    testsToReport: multi(fd, "testsToReport"),
    ieltsTimesTaken: num(fd, "ieltsTimesTaken"),
    ieltsListening: str(fd, "ieltsListening"),
    ieltsReading: str(fd, "ieltsReading"),
    ieltsWriting: str(fd, "ieltsWriting"),
    ieltsSpeaking: str(fd, "ieltsSpeaking"),
    ieltsOverall: str(fd, "ieltsOverall"),
    ieltsDate: d("ieltsDate"),
    satReadingWriting: str(fd, "satReadingWriting"),
    satReadingWritingDate: d("satReadingWritingDate"),
    satMath: str(fd, "satMath"),
    satMathDate: d("satMathDate"),
    actComposite: str(fd, "actComposite"),
    actCompositeDate: d("actCompositeDate"),
  };
  await db.testScores.upsert({ where: { applicantId: id }, update: data, create: { applicantId: id, ...data } });
  advance(String(fd.get("token")), "activities");
}

export async function addIntakeActivity(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  const raw = String(fd.get("rawDescription") ?? "").trim();
  if (!raw) return;
  await db.activity.create({
    data: {
      applicantId: id,
      category: str(fd, "category"),
      position: str(fd, "position"),
      organization: str(fd, "organization"),
      gradeLevels: multi(fd, "gradeLevels"),
      timing: multi(fd, "timing"),
      hoursPerWeek: num(fd, "hoursPerWeek"),
      weeksPerYear: num(fd, "weeksPerYear"),
      collegeIntent: str(fd, "collegeIntent"),
      rawDescription: raw,
    },
  });
  stay(String(fd.get("token")));
}
export async function deleteIntakeActivity(fd: FormData) {
  const id = await aid(fd);
  const actId = String(fd.get("activityId") ?? "");
  const act = await db.activity.findUnique({ where: { id: actId } });
  if (!id || !act || act.applicantId !== id) return;
  await db.activity.delete({ where: { id: actId } });
  stay(String(fd.get("token")));
}

export async function addIntakeHonor(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return;
  await db.honor.create({
    data: {
      applicantId: id,
      title,
      gradeLevels: multi(fd, "gradeLevels"),
      level: multi(fd, "level"),
      rawDescription: String(fd.get("rawDescription") ?? "").trim(),
    },
  });
  stay(String(fd.get("token")));
}
export async function deleteIntakeHonor(fd: FormData) {
  const id = await aid(fd);
  const honorId = String(fd.get("honorId") ?? "");
  const honor = await db.honor.findUnique({ where: { id: honorId } });
  if (!id || !honor || honor.applicantId !== id) return;
  await db.honor.delete({ where: { id: honorId } });
  stay(String(fd.get("token")));
}

export async function submitIntake(fd: FormData) {
  const id = await aid(fd);
  if (!id) return;
  await db.applicant.update({ where: { id }, data: { intakeSubmittedAt: new Date() } });
  stay(String(fd.get("token")));
}
