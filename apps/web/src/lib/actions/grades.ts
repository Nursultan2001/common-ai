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

// The standard Kazakhstan secondary course list (national curriculum / SpanTran
// evaluation), mapped to Common App subject + level. Same set for every grade so
// a KZ student only enters grades.
const KAZAKHSTAN_COURSES: { subject: string; courseName: string; courseLevel: string }[] = [
  { subject: "Foreign/World Language", courseName: "Kazakh Language", courseLevel: "Regular/Standard" },
  { subject: "Foreign/World Language", courseName: "Kazakh Literature", courseLevel: "Regular/Standard" },
  { subject: "Foreign/World Language", courseName: "Russian Language", courseLevel: "Regular/Standard" },
  { subject: "Foreign/World Language", courseName: "Russian Literature", courseLevel: "Regular/Standard" },
  { subject: "English", courseName: "Foreign Language (English)", courseLevel: "Regular/Standard" },
  { subject: "Algebra", courseName: "Algebra and Basics of Analysis", courseLevel: "Regular/Standard" },
  { subject: "Geometry", courseName: "Geometry", courseLevel: "Regular/Standard" },
  { subject: "Computer Science", courseName: "Computer Science", courseLevel: "Regular/Standard" },
  { subject: "Earth/Environmental Science", courseName: "Geography", courseLevel: "Regular/Standard" },
  { subject: "Biology", courseName: "Biology", courseLevel: "Regular/Standard" },
  { subject: "Physics", courseName: "Physics", courseLevel: "Regular/Standard" },
  { subject: "Chemistry", courseName: "Chemistry", courseLevel: "Regular/Standard" },
  { subject: "History/Social Science", courseName: "World History", courseLevel: "Regular/Standard" },
  { subject: "History/Social Science", courseName: "History of Kazakhstan", courseLevel: "Regular/Standard" },
  { subject: "History/Social Science", courseName: "Basics of Law", courseLevel: "Regular/Standard" },
  { subject: "Art (Visual or Performing)", courseName: "Artistic Work", courseLevel: "Regular/Standard" },
  { subject: "Physical Education/Health", courseName: "Physical Training", courseLevel: "Regular/Standard" },
  { subject: "Other/Elective", courseName: "Basic Military and Technological Training", courseLevel: "Regular/Standard" },
];

// Populate a grade (or all grades) with the Kazakhstan course list. KZ uses
// quarters and a 2–5 scale (5 = best); default every term's grade to "5" and
// mark credits N/A. Replaces the grade's existing courses. `grade` is "9".."12"
// or "all".
export async function loadKazakhstanCoursesAction(formData: FormData) {
  const applicant = await getActiveApplicant();
  const which = String(formData.get("grade") ?? "");
  const grades = which === "all" ? GRADES : GRADES.filter((g) => g === which);
  if (grades.length === 0) return;

  for (const grade of grades) {
    const report = await getOrCreateReport(applicant.id, grade);
    if (!report) continue;
    // KZ 2–5 grades sit on Common App's 0.0–5.0 scale; grade cells use decimals
    // (5.0, 4.9, …), so preset every term to "5.0".
    await db.gradeReport.update({
      where: { id: report.id },
      data: { schedule: "Quarters", gradingScale: "0.0-5.0", reportedAll: true },
    });
    await db.gradeCourse.deleteMany({ where: { gradeReportId: report.id } });
    await db.gradeCourse.createMany({
      data: KAZAKHSTAN_COURSES.map((c, i) => ({
        gradeReportId: report.id, order: i,
        subject: c.subject, courseName: c.courseName, courseLevel: c.courseLevel,
        grade1: "5.0", grade2: "5.0", grade3: "5.0", grade4: "5.0", gradeFinal: "5.0",
        creditNA: true,
      })),
    });
  }
  revalidatePath("/dashboard/grades");
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
