"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : null;
}
function n(fd: FormData, k: string): number | null {
  const v = s(fd, k);
  if (v === null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function saveTestingAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const date = s(formData, "ieltsDate");
  const d = (k: string) => {
    const v = s(formData, k);
    return v ? new Date(v) : null;
  };

  const data = {
    selfReportScores: s(formData, "selfReportScores"),
    internationalLeavingExam: s(formData, "internationalLeavingExam"),
    testsToReport:
      formData.getAll("testsToReport").map((v) => String(v).trim()).filter(Boolean).join(", ") ||
      null,
    ieltsTimesTaken: n(formData, "ieltsTimesTaken"),
    ieltsFutureSittings: s(formData, "ieltsFutureSittings"),
    ieltsListening: s(formData, "ieltsListening"),
    ieltsReading: s(formData, "ieltsReading"),
    ieltsWriting: s(formData, "ieltsWriting"),
    ieltsSpeaking: s(formData, "ieltsSpeaking"),
    ieltsOverall: s(formData, "ieltsOverall"),
    ieltsDate: date ? new Date(date) : null,
    satPastCount: s(formData, "satPastCount"),
    satFutureSittings: s(formData, "satFutureSittings"),
    satFutureDate1: d("satFutureDate1"),
    satFutureDate2: d("satFutureDate2"),
    satFutureDate3: d("satFutureDate3"),
    satReadingWriting: s(formData, "satReadingWriting"),
    satReadingWritingDate: d("satReadingWritingDate"),
    satMath: s(formData, "satMath"),
    satMathDate: d("satMathDate"),
    satEssayReport: s(formData, "satEssayReport"),
    satEssay: s(formData, "satEssay"),
    satEssayDate: d("satEssayDate"),
    actPastCount: s(formData, "actPastCount"),
    actComposite: s(formData, "actComposite"),
    actCompositeDate: d("actCompositeDate"),
    actEnglish: s(formData, "actEnglish"),
    actEnglishDate: d("actEnglishDate"),
    actMath: s(formData, "actMath"),
    actMathDate: d("actMathDate"),
    actReading: s(formData, "actReading"),
    actReadingDate: d("actReadingDate"),
    actReportScience: s(formData, "actReportScience"),
    actScience: s(formData, "actScience"),
    actScienceDate: d("actScienceDate"),
    actReportWriting: s(formData, "actReportWriting"),
    actWriting: s(formData, "actWriting"),
    actWritingDate: d("actWritingDate"),
    actFutureSittings: s(formData, "actFutureSittings"),
    ssleCount: n(formData, "ssleCount"),
  };

  await db.testScores.upsert({
    where: { applicantId: applicant.id },
    update: data,
    create: { applicantId: applicant.id, ...data },
  });
  revalidatePath("/dashboard/testing");
}
