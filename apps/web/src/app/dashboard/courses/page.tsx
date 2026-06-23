import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import {
  addCourseAction,
  deleteCourseAction,
  saveCourseSettingsAction,
} from "@/lib/actions/courses";

export const dynamic = "force-dynamic";

// Exact Common App course dropdown option lists (harvested from the live form),
// so stored values match the combobox options and autofill selects them cleanly.
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
// Per-course schedule (Common App requires it; options depend on the scheduling
// system — these are the Semester-system options, which cover most cases).
const SCHEDULES = ["Full Year", "First Semester", "Second Semester"];

export default async function CoursesPage() {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const [courses, profile] = await Promise.all([
    db.course.findMany({
      where: { applicantId: applicant.id },
      orderBy: { order: "asc" },
    }),
    db.masterProfile.findUnique({ where: { applicantId: applicant.id } }),
  ]);

  return (
    <main>
      <h1>Courses &amp; grades</h1>
      <p className="muted">
        Your current/senior-year courses (Common App allows up to 12). Add them in
        order; the extension sets the course count, the scheduling system, and
        fills each course’s subject, name, level, and schedule.
      </p>

      <div className="card">
        <h2>Course settings</h2>
        <form action={saveCourseSettingsAction}>
          <div className="row">
            <div style={{ flex: "1 1 240px" }}>
              <label>Course scheduling system (your institution)</label>
              <select name="courseScheduleSystem" defaultValue={profile?.courseScheduleSystem ?? ""}>
                <option value="">—</option>
                <option>Semester</option>
                <option>Trimester</option>
                <option>Quarter</option>
                <option>Yearly</option>
              </select>
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label>Courses to report</label>
              <input value={courses.length} disabled readOnly />
            </div>
          </div>
          <button className="primary" type="submit">Save settings</button>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Subject</th>
              <th>Course name</th>
              <th>Level</th>
              <th>Schedule</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c, i) => (
              <tr key={c.id}>
                <td className="muted">{i + 1}</td>
                <td>{c.subject ?? "—"}</td>
                <td>{c.name ?? "—"}</td>
                <td className="muted">{c.level ?? "—"}</td>
                <td className="muted">{c.schedule ?? "—"}</td>
                <td>
                  <form action={deleteCourseAction}>
                    <input type="hidden" name="courseId" value={c.id} />
                    <button style={{ marginTop: 0 }}>Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No courses yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Add a course</h2>
        <form action={addCourseAction}>
          <div className="row">
            <div style={{ flex: "1 1 200px" }}>
              <label>Subject</label>
              <select name="subject" defaultValue="">
                <option value="">— Choose a subject —</option>
                {SUBJECTS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <label>Course name</label>
              <input name="name" placeholder="e.g. AP Calculus BC" />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label>Level</label>
              <select name="level" defaultValue="">
                <option value="">— Choose a level —</option>
                {LEVELS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label>Schedule</label>
              <select name="schedule" defaultValue="Full Year">
                {SCHEDULES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <button className="primary" type="submit">Add course</button>
        </form>
      </div>
    </main>
  );
}
