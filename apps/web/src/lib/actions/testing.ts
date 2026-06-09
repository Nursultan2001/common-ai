"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";

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
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const date = s(formData, "ieltsDate");

  const data = {
    selfReportScores: s(formData, "selfReportScores"),
    ieltsTimesTaken: n(formData, "ieltsTimesTaken"),
    ieltsListening: s(formData, "ieltsListening"),
    ieltsReading: s(formData, "ieltsReading"),
    ieltsWriting: s(formData, "ieltsWriting"),
    ieltsSpeaking: s(formData, "ieltsSpeaking"),
    ieltsOverall: s(formData, "ieltsOverall"),
    ieltsDate: date ? new Date(date) : null,
    ssleCount: n(formData, "ssleCount"),
  };

  await db.testScores.upsert({
    where: { applicantId: applicant.id },
    update: data,
    create: { applicantId: applicant.id, ...data },
  });
  revalidatePath("/dashboard/testing");
}
