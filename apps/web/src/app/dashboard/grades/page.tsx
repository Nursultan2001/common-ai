import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import {
  saveTranscriptAccessAction,
  saveGradeReportAction,
  addGradeCourseAction,
  deleteGradeCourseAction,
} from "@/lib/actions/grades";

export const dynamic = "force-dynamic";

const SUBJECTS = [
  "Pre-Algebra", "Algebra", "Geometry", "Trigonometry", "Pre-Calculus",
  "Calculus", "Math (Other)", "Biology", "Chemistry", "Physics",
  "Earth/Environmental Science", "Science (Other)", "English",
  "History/Social Science", "Foreign/World Language",
  "Physical Education/Health", "Art (Visual or Performing)",
  "Computer Science", "Religion", "Other/Elective",
];
const LEVELS = [
  "Regular/Standard", "Accelerated", "Advanced", "Advanced Placement (AP)",
  "AS/A-level/International A-level, Cambridge AICE", "College Prep",
  "Dual Enrollment", "Enriched", "GCSE, IGCSE", "Gifted", "High Honors",
  "Honors", "Intensive", "International Baccalaureate (IB)", "Pre-IB",
  "Regents", "N/A",
];
const SCHOOL_YEARS = Array.from({ length: 26 }, (_, i) => {
  const start = 2025 - i;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
});
const GRADING_SCALES = ["A-F", "1-100", "0.0-4.0", "0.0-5.0", "1-7", "1-10", "1-11", "1-20", "Other"];
const SCHEDULES = ["Semesters", "Trimesters", "Quarters", "Yearly", "Other"];
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

type ReportT = {
  id: string; grade: string; schoolName: string | null; schoolYear: string | null;
  gradingScale: string | null; schedule: string | null; reportedAll: boolean;
  courses: { id: string; subject: string | null; courseName: string | null; courseLevel: string | null }[];
};

function GradeCard({ grade, report }: { grade: string; report?: ReportT }) {
  return (
    <div className="card">
      <h2>{grade}th grade</h2>
      <form action={saveGradeReportAction}>
        <input type="hidden" name="grade" value={grade} />
        <div className="row">
          <div style={{ flex: "1 1 220px" }}>
            <label>School name</label>
            <input name="schoolName" defaultValue={report?.schoolName ?? ""} placeholder="Use the high school where you received credit" />
          </div>
          <Sel label="School year" name="schoolYear" value={report?.schoolYear} options={SCHOOL_YEARS} flex="1 1 130px" />
          <Sel label="Grading scale" name="gradingScale" value={report?.gradingScale} options={GRADING_SCALES} flex="1 1 130px" />
          <Sel label="Schedule" name="schedule" value={report?.schedule} options={SCHEDULES} flex="1 1 130px" />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input type="checkbox" name="reportedAll" defaultChecked={report?.reportedAll} style={{ width: "auto" }} />
          I have reported all of my courses for this grade
        </label>
        <button className="primary" type="submit">Save {grade}th-grade transcript</button>
      </form>

      {report && report.courses.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Subject</th><th>Course name</th><th>Level</th><th></th></tr>
          </thead>
          <tbody>
            {report.courses.map((c) => (
              <tr key={c.id}>
                <td>{c.subject ?? "—"}</td>
                <td>{c.courseName ?? "—"}</td>
                <td className="muted">{c.courseLevel ?? "—"}</td>
                <td>
                  <form action={deleteGradeCourseAction}>
                    <input type="hidden" name="courseId" value={c.id} />
                    <button style={{ marginTop: 0 }}>Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form action={addGradeCourseAction} style={{ marginTop: 12 }}>
        <input type="hidden" name="grade" value={grade} />
        <div className="row">
          <Sel label="Subject" name="subject" options={SUBJECTS} flex="1 1 180px" />
          <div style={{ flex: "1 1 200px" }}>
            <label>Course name</label>
            <input name="courseName" placeholder="exactly as on transcript" />
          </div>
          <Sel label="Course level" name="courseLevel" options={LEVELS} flex="1 1 180px" />
        </div>
        <button type="submit">Add course to {grade}th grade</button>
      </form>
    </div>
  );
}

export default async function GradesPage() {
  const user = await requireUser();
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
      <h1>Courses &amp; grades (transcript)</h1>
      <p className="muted">
        Some colleges (e.g. Purdue) require your full transcript by grade. Enter
        each grade’s courses exactly as they appear on your transcript. The
        extension opens each grade’s grid on Common App, fills the school/year/
        scale/schedule and every course, and ticks “reported all” — for your
        review before submit.
      </p>

      <div className="card">
        <h2>Transcript access</h2>
        <form action={saveTranscriptAccessAction}>
          <div className="row">
            <Sel label="I can access a copy of my transcript(s) or official grades"
              name="transcriptAccess" value={profile?.transcriptAccess}
              options={["Yes", "No"]} flex="1 1 320px" />
          </div>
          <button className="primary" type="submit">Save</button>
        </form>
      </div>

      {GRADES.map((g) => (
        <GradeCard key={g} grade={g} report={byGrade[g]} />
      ))}
    </main>
  );
}
