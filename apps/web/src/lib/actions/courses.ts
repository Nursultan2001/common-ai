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

export async function addCourseAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const name = s(formData, "name");
  const subject = s(formData, "subject");
  if (!name && !subject) return;

  const count = await db.course.count({ where: { applicantId: applicant.id } });
  await db.course.create({
    data: {
      applicantId: applicant.id,
      order: count,
      subject,
      name,
      level: s(formData, "level"),
      schedule: s(formData, "schedule"),
    },
  });
  revalidatePath("/dashboard/courses");
}

export async function deleteCourseAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("courseId") ?? "");
  const course = await db.course.findUnique({ where: { id } });
  if (!course || !(await canAccessApplicant(user, course.applicantId))) return;
  await db.course.delete({ where: { id } });
  revalidatePath("/dashboard/courses");
}
