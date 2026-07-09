import { db } from "@/lib/db";
import { requireUser, getActiveApplicant } from "@/lib/server-auth";
import { saveTranscriptAccessAction, loadKazakhstanCoursesAction } from "@/lib/actions/grades";
import { GradeCard, type ReportT } from "./GradeCard";

export const dynamic = "force-dynamic";

const GRADES = ["9", "10", "11", "12"];

function Sel({ label, name, value, options, flex = "1 1 160px" }:
  { label: string; name: string; value?: string | null; options: string[]; flex?: string }) {
  return (
    <div style={{ flex }}>
      <label>{label}</label>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default async function GradesPage() {
  await requireUser();
  const applicant = await getActiveApplicant();
  const [profile, reports] = await Promise.all([
    db.masterProfile.findUnique({ where: { applicantId: applicant.id } }),
    db.gradeReport.findMany({
      where: { applicantId: applicant.id },
      include: { courses: { orderBy: { order: "asc" } } },
    }),
  ]);
  const byGrade = Object.fromEntries(reports.map((r) => [r.grade, r as ReportT]));

  return (
    <main>
      <h1>Courses &amp; grades</h1>
      <p className="muted">
        Some colleges require your full transcript by grade (9–11, plus 12 if
        you’ve studied it). For each grade, set the school, year, grading scale
        and <strong>schedule</strong> — the grade &amp; credit columns update
        live to match that schedule (Yearly → Final only; Semesters → S1/S2/Final;
        Trimesters → T1–T3/Final; Quarters → Q1–Q4/Final). Enter each course
        exactly as on your transcript, with its grades and credits.
      </p>

      <div className="card">
        <h2>Transcript access &amp; other courses</h2>
        <form action={saveTranscriptAccessAction}>
          <div className="row">
            <Sel label="I can access a copy of my transcript(s) or official grades"
              name="transcriptAccess" value={profile?.transcriptAccess}
              options={["Yes", "No"]} flex="1 1 320px" />
            <Sel label="Any OTHER courses on your transcript with grades? (middle school, post-12th, or summer)"
              name="otherCoursesOnTranscript" value={profile?.otherCoursesOnTranscript ?? "No"}
              options={["Yes", "No"]} flex="1 1 320px" />
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            The second answer fills the <strong>“Other Courses”</strong> page
            (13/59). Most Kazakhstan students answer <strong>No</strong> — leave
            it as No unless you have middle-school, summer, or post-12th courses
            printed on your official transcript.
          </p>
          <button className="primary" type="submit">Save</button>
        </form>
      </div>

      <div className="card" style={{ borderColor: "rgba(91,140,255,.35)" }}>
        <h2>🇰🇿 Kazakhstan quick-fill</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Populate all four grades (9–12) with the standard Kazakhstan course
          list — <strong>Quarters</strong> schedule, <strong>0.0–5.0</strong>
          grading scale, every term preset to <strong>5.0</strong>, credits
          <strong>N/A</strong>. Then just adjust any grades that aren’t 5.
          (Replaces existing courses in each grade.)
        </p>
        <form action={loadKazakhstanCoursesAction}>
          <input type="hidden" name="grade" value="all" />
          <button className="primary" type="submit">Load Kazakhstan courses for grades 9–12</button>
        </form>
      </div>

      {GRADES.map((g) => (
        <GradeCard key={g} grade={g} report={byGrade[g]} />
      ))}
    </main>
  );
}
