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
function multi(fd: FormData, k: string): string | null {
  const arr = fd.getAll(k).map((v) => String(v).trim()).filter(Boolean);
  return arr.length ? arr.join(", ") : null;
}

function payload(fd: FormData) {
  return {
    name: s(fd, "name"),
    notListed: s(fd, "notListed") ?? "Yes",
    country: s(fd, "country"),
    address1: s(fd, "address1"),
    address2: s(fd, "address2"),
    address3: s(fd, "address3"),
    city: s(fd, "city"),
    state: s(fd, "state"),
    zip: s(fd, "zip"),
    courseDetails: multi(fd, "courseDetails"),
    fromDate: d(fd, "fromDate"),
    toDate: d(fd, "toDate"),
    degreeEarned: s(fd, "degreeEarned"),
  };
}

// Common App allows up to 3 colleges.
export async function addCollegeAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const data = payload(formData);
  if (!data.name) return;

  const count = await db.college.count({ where: { applicantId: applicant.id } });
  if (count >= 3) return;

  await db.college.create({
    data: { applicantId: applicant.id, order: count, ...data },
  });
  revalidatePath("/dashboard/profile");
}

export async function updateCollegeAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("collegeId") ?? "");
  const row = await db.college.findUnique({ where: { id } });
  if (!row || !(await canAccessApplicant(user, row.applicantId))) return;

  await db.college.update({ where: { id }, data: payload(formData) });
  revalidatePath("/dashboard/profile");
}

export async function deleteCollegeAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("collegeId") ?? "");
  const row = await db.college.findUnique({ where: { id } });
  if (!row || !(await canAccessApplicant(user, row.applicantId))) return;
  await db.college.delete({ where: { id } });

  // Re-pack order so it stays 0..n-1 (the page reveals blocks by count).
  const rest = await db.college.findMany({
    where: { applicantId: row.applicantId },
    orderBy: { order: "asc" },
  });
  await Promise.all(
    rest.map((r, i) => db.college.update({ where: { id: r.id }, data: { order: i } }))
  );
  revalidatePath("/dashboard/profile");
}
