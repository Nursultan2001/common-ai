import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSessionUser, canAccessApplicant, corsHeaders } from "@/lib/auth";
import { isApplicationUnlocked } from "@/lib/entitlements";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// Serves the data the extension needs to autofill ONE application.
// GET /api/extension/profile?applicationId=...
//
// Two guarantees enforced here:
//  1. Returns nothing unless the application's entitlement is PAID (the paywall).
//  2. Only returns APPROVED polished content + stored profile facts. Never any
//     AI draft that the student hasn't approved, never invented values.
export async function GET(req: Request) {
  const headers = corsHeaders();
  const user = await resolveSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }

  const applicationId = new URL(req.url).searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json(
      { error: "applicationId required" },
      { status: 400, headers }
    );
  }

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { university: true },
  });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers });
  }
  if (!(await canAccessApplicant(user, application.applicantId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  // Paywall gate.
  if (!(await isApplicationUnlocked(applicationId))) {
    return NextResponse.json(
      { error: "locked", unlocked: false },
      { status: 402, headers }
    );
  }

  const applicant = await db.applicant.findUnique({
    where: { id: application.applicantId },
    include: {
      profile: true,
      activities: { orderBy: { orderIndex: "asc" } },
      honors: { orderBy: { orderIndex: "asc" } },
      documents: {
        select: { id: true, type: true, fileName: true, mimeType: true },
      },
      essays: { where: { status: "APPROVED" } },
      parents: { orderBy: { order: "asc" } },
      siblings: { orderBy: { order: "asc" } },
      testScores: true,
    },
  });
  if (!applicant) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers });
  }

  await db.auditEvent.create({
    data: {
      action: "AUTOFILL_SERVED",
      userId: user.id,
      applicantId: applicant.id,
      meta: JSON.stringify({ applicationId, university: application.university.name }),
    },
  });

  // Map to the flat shape the field-map templates expect. Only APPROVED polished
  // content is exposed; otherwise fall back to nothing (never a raw AI draft).
  return NextResponse.json(
    {
      unlocked: true,
      fieldMapKey: application.university.fieldMapKey,
      portalType: application.university.portalType,
      profile: applicant.profile ?? {},
      activities: applicant.activities.map((a) => ({
        category: a.category,
        position: a.position,
        organization: a.organization,
        gradeLevels: a.gradeLevels,
        timing: a.timing,
        hoursPerWeek: a.hoursPerWeek,
        weeksPerYear: a.weeksPerYear,
        description: a.status === "APPROVED" ? a.polishedDescription : null,
      })),
      honors: applicant.honors.map((h) => ({
        title: h.status === "APPROVED" ? h.polishedTitle ?? h.title : h.title,
        gradeLevels: h.gradeLevels,
        level: h.level,
      })),
      essays: applicant.essays.map((e) => ({
        kind: e.kind,
        prompt: e.prompt,
        text: e.finalText, // only the student's own final text
      })),
      parents: applicant.parents.map((p) => ({
        relationship: p.relationship,
        firstName: p.firstName,
        middleInitial: p.middleInitial,
        lastName: p.lastName,
        suffix: p.suffix,
        formerLastName: p.formerLastName,
        email: p.email,
        occupation: p.occupation,
      })),
      siblings: applicant.siblings.map((s) => ({
        firstName: s.firstName,
        lastName: s.lastName,
        ageOrGrade: s.ageOrGrade,
      })),
      testScores: applicant.testScores ?? {},
      // Document manifest only — bytes are fetched separately and on demand.
      documents: applicant.documents,
    },
    { headers }
  );
}
