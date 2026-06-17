import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSessionUser, canAccessApplicant, corsHeaders } from "@/lib/auth";
import { isApplicationUnlocked } from "@/lib/entitlements";
import { PERSONAL_ESSAY_PROMPTS } from "@/lib/essayPrompts";

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
      languages: { orderBy: { order: "asc" } },
      otherSchools: { orderBy: { order: "asc" } },
      colleges: { orderBy: { order: "asc" } },
      testScores: true,
      courses: { orderBy: { order: "asc" } },
      gradeReports: { include: { courses: { orderBy: { order: "asc" } } } },
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
      // Activities (page 7/232): report = Yes when any exist; click "Add another
      // activity" once per activity beyond the first.
      reportActivities: applicant.activities.length ? "Yes" : "No",
      activitiesAddClicks: String(Math.max(0, applicant.activities.length - 1)),
      activities: applicant.activities.map((a) => ({
        category: a.category,
        position: a.position,
        organization: a.organization,
        gradeLevels: a.gradeLevels,
        timing: a.timing,
        hoursPerWeek: a.hoursPerWeek,
        weeksPerYear: a.weeksPerYear,
        collegeIntent: a.collegeIntent,
        description: a.status === "APPROVED" ? a.polishedDescription : null,
      })),
      // Responsibilities & circumstances (page 7/250).
      responsibilities: applicant.profile?.responsibilities ?? null,
      circumstances: applicant.profile?.circumstances ?? null,
      // Honors (page 4/25): report = Yes when any exist; the extension clicks
      // "Add another honors" once per honor beyond the first.
      reportHonors: applicant.honors.length ? "Yes" : "No",
      honorsAddClicks: String(Math.max(0, applicant.honors.length - 1)),
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
      // Courses & Grades transcript (13/54–13/58): intro access + per-grade data.
      transcriptAccess: applicant.profile?.transcriptAccess ?? null,
      gradeData: Object.fromEntries(
        applicant.gradeReports.map((r) => [
          r.grade,
          {
            schoolName: r.schoolName,
            schoolYear: r.schoolYear,
            gradingScale: r.gradingScale,
            schedule: r.schedule,
            reportedAll: r.reportedAll,
            courses: r.courses.map((c) => ({
              subject: c.subject,
              courseName: c.courseName,
              courseLevel: c.courseLevel,
            })),
          },
        ])
      ),
      // Additional Information (Writing): Yes/No derived from whether text exists.
      addlInfoShare: applicant.profile?.addlInfoText ? "Yes" : "No",
      addlInfoText: applicant.profile?.addlInfoText ?? null,
      addlQualificationsShare: applicant.profile?.addlQualificationsText ? "Yes" : "No",
      addlQualificationsText: applicant.profile?.addlQualificationsText ?? null,
      // Personal essay (Writing page): only the APPROVED statement is exposed.
      // essayUnderstand always checks the acknowledgment; essayPromptIndex picks
      // the matching prompt radio; essayText fills the editor.
      ...(() => {
        const ps = applicant.essays.find(
          (e) => e.kind === "PERSONAL_STATEMENT" && e.status === "APPROVED" && e.finalText
        );
        if (!ps) return {};
        const idx = ps.prompt ? PERSONAL_ESSAY_PROMPTS.indexOf(ps.prompt) + 1 : 0;
        return {
          essayUnderstand: "I understand",
          essayPromptIndex: idx >= 1 ? String(idx) : null,
          essayText: ps.finalText,
        };
      })(),
      parents: applicant.parents.map((p) => ({
        parentType: p.parentType,
        isLiving: p.isLiving,
        prefix: p.prefix,
        relationship: p.relationship,
        firstName: p.firstName,
        middleInitial: p.middleInitial,
        lastName: p.lastName,
        suffix: p.suffix,
        formerLastName: p.formerLastName,
        email: p.email,
        phoneType: p.phoneType,
        phoneCountryCode: p.phoneCountryCode,
        phoneNumber: p.phoneNumber,
        occupation: p.occupation,
        occupationOther: p.occupationOther,
        employmentStatus: p.employmentStatus,
        educationLevel: p.educationLevel,
      })),
      siblings: applicant.siblings.map((s) => ({
        firstName: s.firstName,
        lastName: s.lastName,
        ageOrGrade: s.ageOrGrade,
      })),
      testScores: applicant.testScores ?? {},
      languageCount: applicant.languages.length
        ? String(applicant.languages.length)
        : null,
      languages: applicant.languages.map((l) => ({
        name: l.name,
        proficiency: l.proficiency,
      })),
      courseCount: applicant.courses.length
        ? String(applicant.courses.length)
        : null,
      courses: applicant.courses.map((c) => ({
        subject: c.subject,
        name: c.name,
        level: c.level,
        schedule: c.schedule,
      })),
      // Community-Based Organizations (page 4/22): always 0 — we are the
      // student's free application assistance, so no outside org is reported.
      communityOrgsCount: "0",
      // Additional secondary/high schools (page 4/19).
      otherSchoolsCount: String(applicant.otherSchools.length),
      otherSchools: applicant.otherSchools.map((o) => ({
        name: o.name,
        notListed: o.notListed,
        country: o.country,
        type: o.type,
        address1: o.address1,
        address2: o.address2,
        address3: o.address3,
        city: o.city,
        state: o.state,
        zip: o.zip,
        fromDate: o.fromDate,
        toDate: o.toDate,
        reasonLeft: o.reasonLeft,
      })),
      // Colleges/universities with prior coursework (page 4/21).
      collegeCount: String(applicant.colleges.length),
      colleges: applicant.colleges.map((c) => ({
        name: c.name,
        notListed: c.notListed,
        country: c.country,
        address1: c.address1,
        address2: c.address2,
        address3: c.address3,
        city: c.city,
        state: c.state,
        zip: c.zip,
        courseDetails: c.courseDetails,
        fromDate: c.fromDate,
        toDate: c.toDate,
        degreeEarned: c.degreeEarned,
      })),
      // The Common App reason box is one field for all of them — combine the
      // per-school reasons, labelled by school, into a single block of text.
      otherSchoolsReason:
        applicant.otherSchools
          .map((o, i) =>
            o.reasonLeft
              ? `${o.name || `School ${i + 2}`}: ${o.reasonLeft}`
              : null
          )
          .filter(Boolean)
          .join("\n\n") || null,
      // Document manifest only — bytes are fetched separately and on demand.
      documents: applicant.documents,
    },
    { headers }
  );
}
