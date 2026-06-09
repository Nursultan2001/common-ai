import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { addCourseAction, deleteCourseAction } from "@/lib/actions/courses";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const courses = await db.course.findMany({
    where: { applicantId: applicant.id },
    orderBy: { order: "asc" },
  });

  return (
    <main>
      <h1>Courses &amp; grades</h1>
      <p className="muted">
        Your current/senior-year courses (Common App allows up to 12). Add them in
        order; the extension fills the course grid.
      </p>

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
            <div style={{ flex: "1 1 160px" }}>
              <label>Subject</label>
              <input name="subject" placeholder="e.g. Mathematics" />
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label>Course name</label>
              <input name="name" placeholder="e.g. AP Calculus BC" />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label>Level</label>
              <input name="level" placeholder="e.g. AP" />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label>Schedule</label>
              <input name="schedule" placeholder="e.g. Full Year" />
            </div>
          </div>
          <button className="primary" type="submit">Add course</button>
        </form>
      </div>
    </main>
  );
}
