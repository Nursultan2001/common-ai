import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="row" style={{ gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(140,160,210,.08)" }}>
      <span className="muted" style={{ flex: "0 0 230px", fontSize: 13 }}>{label}</span>
      <span style={{ flex: "1 1 auto" }}>{value === null || value === undefined || value === "" ? <span className="muted">—</span> : String(value)}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
const fmtDate = (d?: Date | null) => (d ? new Date(d).toLocaleDateString() : null);

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const a = await db.applicant.findUnique({
    where: { id: params.id },
    include: {
      profile: true,
      parents: { orderBy: { order: "asc" } },
      siblings: { orderBy: { order: "asc" } },
      languages: { orderBy: { order: "asc" } },
      testScores: true,
      activities: { orderBy: { createdAt: "asc" } },
      honors: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!a) notFound();
  const allowed =
    user.role === "ADMIN" || (a.orgId && a.orgId === user.orgId) || a.ownerUserId === user.id;
  if (!allowed) notFound();

  const p = a.profile;
  const t = a.testScores;
  const status = a.intakeSubmittedAt ? "Submitted" : p ? "In progress" : "Not started";

  return (
    <main>
      <Link href="/dashboard/clients" className="muted" style={{ fontSize: 13 }}>← All clients</Link>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <h1 style={{ margin: 0 }}>{a.intakeClientName || "(unnamed client)"}</h1>
        <span className={`badge ${a.intakeSubmittedAt ? "paid" : "locked"}`}>{status}</span>
      </div>
      <p className="muted">
        {a.intakeSubmittedAt ? `Submitted ${fmtDate(a.intakeSubmittedAt)}. ` : ""}
        Review the answers below. To edit, open the client form. To put this into
        Common App, set the Applicant ID in the extension and run Autofill.
      </p>

      <div className="card">
        <Row label="Applicant ID (for the extension)" value={a.id} />
        {a.intakeToken && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <Link className="primary" style={{ padding: "9px 14px", borderRadius: 10 }}
              href={`/intake/${a.intakeToken}`}>Open client form (view / edit)</Link>
          </div>
        )}
      </div>

      <Section title="Personal">
        <Row label="Legal name" value={[p?.legalFirstName, p?.middleName, p?.legalLastName].filter(Boolean).join(" ")} />
        <Row label="Preferred name" value={p?.preferredName} />
        <Row label="Date of birth" value={fmtDate(p?.dateOfBirth)} />
        <Row label="Birthplace" value={[p?.birthCity, p?.birthCountry].filter(Boolean).join(", ")} />
        <Row label="Gender" value={p?.gender} />
        <Row label="Legal sex" value={p?.legalSex} />
        <Row label="Pronouns" value={p?.pronouns} />
        <Row label="Armed forces status" value={p?.armedForces} />
        <Row label="Hispanic/Latino" value={p?.hispanicLatino} />
        <Row label="Race/ethnicity" value={p?.raceEthnicity} />
      </Section>

      <Section title="Contact & address">
        <Row label="Email" value={p?.email} />
        <Row label="Phone" value={[p?.phoneCountryCode, p?.phone].filter(Boolean).join(" ")} />
        <Row label="Address" value={[p?.addressLine1, p?.addressLine2, p?.city, p?.state, p?.postalCode, p?.country].filter(Boolean).join(", ")} />
      </Section>

      <Section title="Citizenship">
        <Row label="Status" value={p?.citizenshipStatus} />
        <Row label="Country of citizenship" value={p?.citizenship} />
        <Row label="Years in U.S." value={p?.yearsInUS} />
        <Row label="Holds U.S. visa" value={p?.holdsUSVisa} />
        <Row label="Needs U.S. visa" value={p?.intendsUSVisa} />
        <Row label="Visa type" value={p?.visaType} />
      </Section>

      <Section title={`Languages (${a.languages.length})`}>
        {a.languages.length === 0 && <p className="muted">None.</p>}
        {a.languages.map((l) => <Row key={l.id} label={l.name || "—"} value={l.proficiency} />)}
      </Section>

      <Section title="Family">
        <Row label="Parents’ marital status" value={p?.parentsMaritalStatus} />
        <Row label="Permanent home with" value={p?.permanentHomeWith} />
        <Row label="Has children" value={p?.hasChildren} />
        {a.parents.map((par) => (
          <div key={par.id} style={{ marginTop: 10 }}>
            <strong>Parent {par.order + 1}</strong>
            <Row label="Name" value={[par.firstName, par.lastName].filter(Boolean).join(" ")} />
            <Row label="Type / living" value={[par.parentType, par.isLiving].filter(Boolean).join(" · ")} />
            <Row label="Email / phone" value={[par.email, [par.phoneCountryCode, par.phoneNumber].filter(Boolean).join(" ")].filter(Boolean).join(" · ")} />
            <Row label="Occupation / employment" value={[par.occupation, par.employmentStatus].filter(Boolean).join(" · ")} />
            <Row label="Education" value={par.educationLevel} />
          </div>
        ))}
        {a.siblings.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <strong>Siblings</strong>
            {a.siblings.map((s) => <Row key={s.id} label={[s.firstName, s.lastName].filter(Boolean).join(" ") || "—"} value={s.ageOrGrade} />)}
          </div>
        )}
      </Section>

      <Section title="Education">
        <Row label="High school" value={p?.highSchoolName} />
        <Row label="Entry → graduation" value={[fmtDate(p?.dateOfEntry), fmtDate(p?.graduationDate)].filter(Boolean).join(" → ")} />
        <Row label="Graduation year" value={p?.graduationYear} />
        <Row label="School type / location" value={[p?.highSchoolType, p?.highSchoolCity, p?.highSchoolCountry].filter(Boolean).join(", ")} />
        <Row label="Boarding / graduated here" value={[p?.isBoardingSchool, p?.didGraduate].filter(Boolean).join(" · ")} />
        <Row label="GPA" value={[p?.gpa, p?.gpaScale].filter((x) => x != null).join(" / ")} />
        <Row label="Class size / rank" value={[p?.classSize, p?.classRankReporting].filter(Boolean).join(" · ")} />
        <Row label="Intended major" value={p?.intendedMajor} />
        <Row label="Degree / career" value={[p?.highestDegree, p?.careerInterest].filter(Boolean).join(" · ")} />
      </Section>

      <Section title="Testing">
        <Row label="Self-report scores" value={t?.selfReportScores} />
        <Row label="Tests to report" value={t?.testsToReport} />
        <Row label="SAT (R&W / Math)" value={[t?.satReadingWriting, t?.satMath].filter(Boolean).join(" / ")} />
        <Row label="ACT composite" value={t?.actComposite} />
        <Row label="IELTS overall" value={t?.ieltsOverall} />
      </Section>

      <Section title={`Activities (${a.activities.length})`}>
        {a.activities.length === 0 && <p className="muted">None.</p>}
        {a.activities.map((ac) => (
          <Row key={ac.id} label={[ac.position, ac.organization].filter(Boolean).join(" — ") || ac.category || "Activity"} value={ac.rawDescription} />
        ))}
      </Section>

      <Section title={`Honors (${a.honors.length})`}>
        {a.honors.length === 0 && <p className="muted">None.</p>}
        {a.honors.map((h) => <Row key={h.id} label={h.title} value={[h.gradeLevels, h.level].filter(Boolean).join(" · ")} />)}
      </Section>
    </main>
  );
}
