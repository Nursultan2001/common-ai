"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import { canAccessApplicant } from "@/lib/auth";
import { polishActivity, polishHonor, draftEssayScaffold, refineEssay } from "@/lib/ai";
import { PERSONAL_ESSAY_PROMPTS, PERSONAL_ESSAY_WORD_LIMIT } from "@/lib/essayPrompts";

// ---- Activities ----

export async function addActivityAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const raw = String(formData.get("rawDescription") ?? "").trim();
  if (!raw) return;

  const gradeLevels = formData.getAll("gradeLevels").map(String).filter(Boolean).join(",");
  const timing = formData.getAll("timing").map(String).filter(Boolean).join(",");

  await db.activity.create({
    data: {
      applicantId: applicant.id,
      category: String(formData.get("category") ?? "") || null,
      position: String(formData.get("position") ?? "") || null,
      organization: String(formData.get("organization") ?? "") || null,
      gradeLevels: gradeLevels || null,
      timing: timing || null,
      hoursPerWeek: Number(formData.get("hoursPerWeek")) || null,
      weeksPerYear: Number(formData.get("weeksPerYear")) || null,
      collegeIntent: String(formData.get("collegeIntent") ?? "") || null,
      rawDescription: raw,
    },
  });
  revalidatePath("/dashboard/activities");
}

// Responsibilities & circumstances (Activities page 7/250). Multi-checkbox; we
// store the exact Common App option labels as CSV so autofill matches them.
export async function saveResponsibilitiesAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  // Join with "||" (option labels themselves contain commas).
  const multi = (k: string) =>
    formData.getAll(k).map((v) => String(v).trim()).filter(Boolean).join("||") || null;
  const data = {
    responsibilities: multi("responsibilities"),
    circumstances: multi("circumstances"),
  };
  await db.masterProfile.upsert({
    where: { applicantId: applicant.id },
    update: data,
    create: { applicantId: applicant.id, ...data },
  });
  revalidatePath("/dashboard/activities");
}

export async function polishActivityAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("activityId") ?? "");
  const activity = await db.activity.findUnique({ where: { id } });
  if (!activity || !(await canAccessApplicant(user, activity.applicantId))) return;

  let result: Awaited<ReturnType<typeof polishActivity>> | null = null;
  try {
    result = await polishActivity({
      category: activity.category,
      position: activity.position,
      organization: activity.organization,
      rawDescription: activity.rawDescription,
    });
  } catch {
    redirect("/dashboard/activities?aiError=1");
  }

  await db.activity.update({
    where: { id },
    data: { polishedDescription: result.text, status: "DRAFTED" },
  });
  await db.auditEvent.create({
    data: {
      action: "AI_POLISH_ACTIVITY",
      userId: user.id,
      applicantId: activity.applicantId,
      meta: JSON.stringify({ activityId: id, missing: result.missing }),
    },
  });
  revalidatePath("/dashboard/activities");
}

// The student edits the polished text, then approves. Only APPROVED content is
// ever exposed to autofill.
export async function approveActivityAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("activityId") ?? "");
  const edited = String(formData.get("polishedDescription") ?? "").trim().slice(0, 150);
  const activity = await db.activity.findUnique({ where: { id } });
  if (!activity || !(await canAccessApplicant(user, activity.applicantId))) return;

  await db.activity.update({
    where: { id },
    data: { polishedDescription: edited || activity.polishedDescription, status: "APPROVED" },
  });
  revalidatePath("/dashboard/activities");
}

export async function deleteActivityAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("activityId") ?? "");
  const activity = await db.activity.findUnique({ where: { id } });
  if (!activity || !(await canAccessApplicant(user, activity.applicantId))) return;
  await db.activity.delete({ where: { id } });
  revalidatePath("/dashboard/activities");
}

// ---- Honors ----

export async function addHonorAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const multi = (k: string) =>
    formData.getAll(k).map((v) => String(v).trim()).filter(Boolean).join(", ") || null;

  await db.honor.create({
    data: {
      applicantId: applicant.id,
      title,
      gradeLevels: multi("gradeLevels"),
      level: multi("level"),
      rawDescription: String(formData.get("rawDescription") ?? "").trim(),
    },
  });
  revalidatePath("/dashboard/honors");
}

export async function polishHonorAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("honorId") ?? "");
  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor || !(await canAccessApplicant(user, honor.applicantId))) return;

  let result: Awaited<ReturnType<typeof polishHonor>> | null = null;
  try {
    result = await polishHonor({
      title: honor.title,
      level: honor.level,
      rawDescription: honor.rawDescription,
    });
  } catch {
    redirect("/dashboard/honors?aiError=1");
  }
  await db.honor.update({
    where: { id },
    data: { polishedTitle: result.text, status: "DRAFTED" },
  });
  await db.auditEvent.create({
    data: {
      action: "AI_POLISH_HONOR",
      userId: user.id,
      applicantId: honor.applicantId,
      meta: JSON.stringify({ honorId: id, missing: result.missing }),
    },
  });
  revalidatePath("/dashboard/honors");
}

export async function approveHonorAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("honorId") ?? "");
  const edited = String(formData.get("polishedTitle") ?? "").trim().slice(0, 100);
  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor || !(await canAccessApplicant(user, honor.applicantId))) return;
  await db.honor.update({
    where: { id },
    data: { polishedTitle: edited || honor.polishedTitle || honor.title, status: "APPROVED" },
  });
  revalidatePath("/dashboard/honors");
}

export async function deleteHonorAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("honorId") ?? "");
  const honor = await db.honor.findUnique({ where: { id } });
  if (!honor || !(await canAccessApplicant(user, honor.applicantId))) return;
  await db.honor.delete({ where: { id } });
  revalidatePath("/dashboard/honors");
}

// ---- Personal essay (Common App Writing) ----
// One PERSONAL_STATEMENT essay per applicant. The student picks a prompt and
// either brain-dumps their material (AI drafts from it) or writes their own
// draft (AI refines it). Either way the student edits and approves the final —
// they remain the author.

async function getOrCreatePersonalEssay(applicantId: string) {
  const existing = await db.essay.findFirst({
    where: { applicantId, kind: "PERSONAL_STATEMENT" },
  });
  if (existing) return existing;
  return db.essay.create({
    data: { applicantId, kind: "PERSONAL_STATEMENT", wordLimit: PERSONAL_ESSAY_WORD_LIMIT },
  });
}

function promptFromIndex(formData: FormData): string | null {
  const idx = Number(formData.get("promptIndex"));
  return idx >= 1 && idx <= PERSONAL_ESSAY_PROMPTS.length
    ? PERSONAL_ESSAY_PROMPTS[idx - 1]
    : null;
}

// Save prompt choice, the student's notes, and/or the student's own draft.
export async function saveEssayAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const essay = await getOrCreatePersonalEssay(applicant.id);
  await db.essay.update({
    where: { id: essay.id },
    data: {
      prompt: promptFromIndex(formData) ?? essay.prompt,
      studentNotes: String(formData.get("studentNotes") ?? "") || null,
      draft: String(formData.get("draft") ?? "") || essay.draft,
    },
  });
  revalidatePath("/dashboard/writing");
}

// Mode A — generate a first draft from the student's notes/material.
export async function generateEssayAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const essay = await getOrCreatePersonalEssay(applicant.id);
  const prompt = promptFromIndex(formData) ?? essay.prompt;
  const studentNotes = String(formData.get("studentNotes") ?? "").trim();
  if (!prompt || !studentNotes) return;

  let r: Awaited<ReturnType<typeof draftEssayScaffold>> | null = null;
  try {
    r = await draftEssayScaffold({ prompt, wordLimit: essay.wordLimit, studentNotes });
  } catch {
    // Save what the student typed so it isn't lost, then show a friendly error.
    await db.essay.update({ where: { id: essay.id }, data: { prompt, studentNotes } });
    redirect("/dashboard/writing?aiError=1");
  }
  await db.essay.update({
    where: { id: essay.id },
    data: { prompt, studentNotes, outline: r.outline || null, draft: r.draft || null, status: "DRAFTED" },
  });
  revalidatePath("/dashboard/writing");
}

// Mode B — refine the student's OWN draft into its strongest version.
export async function refineEssayAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const essay = await getOrCreatePersonalEssay(applicant.id);
  const prompt = promptFromIndex(formData) ?? essay.prompt;
  const studentDraft = String(formData.get("draft") ?? "").trim();
  if (!prompt || !studentDraft) return;

  let r: Awaited<ReturnType<typeof refineEssay>> | null = null;
  try {
    r = await refineEssay({ prompt, wordLimit: essay.wordLimit, studentDraft });
  } catch {
    // Preserve the student's own draft, then show a friendly error.
    await db.essay.update({ where: { id: essay.id }, data: { prompt, draft: studentDraft } });
    redirect("/dashboard/writing?aiError=1");
  }
  await db.essay.update({
    where: { id: essay.id },
    data: {
      prompt,
      // keep the student's original words in studentNotes for reference
      studentNotes: essay.studentNotes ?? studentDraft,
      outline: r.notes.length ? r.notes.join("\n") : essay.outline,
      draft: r.draft || studentDraft,
      status: "DRAFTED",
    },
  });
  revalidatePath("/dashboard/writing");
}

// Approve the final essay (the student's edited text) for autofill.
export async function approveEssayAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const essay = await getOrCreatePersonalEssay(applicant.id);
  const finalText = String(formData.get("finalText") ?? "").trim();
  if (!finalText) return;
  await db.essay.update({
    where: { id: essay.id },
    data: { finalText, draft: finalText, status: "APPROVED" },
  });
  revalidatePath("/dashboard/writing");
}

// Additional Information (Common App Writing section). Two optional free-text
// boxes; the Yes/No radios are derived from whether each box has content.
export async function saveAdditionalInfoAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const data = {
    addlInfoText: String(formData.get("addlInfoText") ?? "").trim() || null,
    addlQualificationsText: String(formData.get("addlQualificationsText") ?? "").trim() || null,
  };
  await db.masterProfile.upsert({
    where: { applicantId: applicant.id },
    update: data,
    create: { applicantId: applicant.id, ...data },
  });
  revalidatePath("/dashboard/writing");
}
