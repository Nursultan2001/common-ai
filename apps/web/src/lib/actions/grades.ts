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

const GRADES = ["9", "10", "11", "12"];

// Per-term grade + credit fields (which columns matter depends on the schedule).
function termData(fd: FormData) {
  return {
    grade1: s(fd, "grade1"), grade2: s(fd, "grade2"), grade3: s(fd, "grade3"),
    grade4: s(fd, "grade4"), gradeFinal: s(fd, "gradeFinal"),
    credit1: s(fd, "credit1"), credit2: s(fd, "credit2"), credit3: s(fd, "credit3"),
    credit4: s(fd, "credit4"), creditFinal: s(fd, "creditFinal"),
    creditNA: fd.get("creditNA") === "on",
  };
}

async function getOrCreateReport(applicantId: string, grade: string) {
  if (!GRADES.includes(grade)) return null;
  const existing = await db.gradeReport.findUnique({
    where: { applicantId_grade: { applicantId, grade } },
  });
  return existing ?? db.gradeReport.create({ data: { applicantId, grade } });
}

// Save a grade's transcript header (school/year/scale/schedule) + reportedAll.
export async function saveGradeReportAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const grade = String(formData.get("grade") ?? "");
  if (!GRADES.includes(grade)) return;

  await db.gradeReport.upsert({
    where: { applicantId_grade: { applicantId: applicant.id, grade } },
    update: {
      schoolName: s(formData, "schoolName"),
      schoolYear: s(formData, "schoolYear"),
      gradingScale: s(formData, "gradingScale"),
      schedule: s(formData, "schedule"),
      reportedAll: formData.get("reportedAll") === "on",
    },
    create: {
      applicantId: applicant.id,
      grade,
      schoolName: s(formData, "schoolName"),
      schoolYear: s(formData, "schoolYear"),
      gradingScale: s(formData, "gradingScale"),
      schedule: s(formData, "schedule"),
      reportedAll: formData.get("reportedAll") === "on",
    },
  });
  revalidatePath("/dashboard/grades");
}

// Intro page (13/54): "I can access a copy of my transcript(s)".
export async function saveTranscriptAccessAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const v = s(formData, "transcriptAccess");
  await db.masterProfile.upsert({
    where: { applicantId: applicant.id },
    update: { transcriptAccess: v },
    create: { applicantId: applicant.id, transcriptAccess: v },
  });
  revalidatePath("/dashboard/grades");
}

export async function addGradeCourseAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const grade = String(formData.get("grade") ?? "");
  const report = await getOrCreateReport(applicant.id, grade);
  if (!report) return;
  const subject = s(formData, "subject");
  const courseName = s(formData, "courseName");
  if (!subject && !courseName) return;

  const count = await db.gradeCourse.count({ where: { gradeReportId: report.id } });
  await db.gradeCourse.create({
    data: {
      gradeReportId: report.id,
      order: count,
      subject,
      courseName,
      courseLevel: s(formData, "courseLevel"),
      ...termData(formData),
    },
  });
  revalidatePath("/dashboard/grades");
}

// Edit an existing course row (grades/credits are usually added after the row).
export async function updateGradeCourseAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("courseId") ?? "");
  const course = await db.gradeCourse.findUnique({ where: { id }, include: { report: true } });
  if (!course || !(await canAccessApplicant(user, course.report.applicantId))) return;
  await db.gradeCourse.update({
    where: { id },
    data: {
      subject: s(formData, "subject"),
      courseName: s(formData, "courseName"),
      courseLevel: s(formData, "courseLevel"),
      ...termData(formData),
    },
  });
  revalidatePath("/dashboard/grades");
}

export async function deleteGradeCourseAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("courseId") ?? "");
  const course = await db.gradeCourse.findUnique({
    where: { id },
    include: { report: true },
  });
  if (!course || !(await canAccessApplicant(user, course.report.applicantId))) return;
  await db.gradeCourse.delete({ where: { id } });
  revalidatePath("/dashboard/grades");
}
