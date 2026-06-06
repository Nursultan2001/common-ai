import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import {
  addActivityAction,
  polishActivityAction,
  approveActivityAction,
  deleteActivityAction,
} from "@/lib/actions/content";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const activities = await db.activity.findMany({
    where: { applicantId: applicant.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main>
      <h1>Activities</h1>
      <p className="muted">
        Describe each activity in your own words. AI tightens it to the Common App
        150-character limit using only your facts. You review and approve.
      </p>

      {activities.map((a) => (
        <div className="card" key={a.id}>
          <div className="row">
            <strong>{a.position || a.organization || "Activity"}</strong>
            <span className="muted">{a.category}</span>
            <span className="spacer" />
            <span className={`badge ${a.status === "APPROVED" ? "paid" : "locked"}`}>
              {a.status}
            </span>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Your words: {a.rawDescription}
          </p>

          <div className="row">
            <form action={polishActivityAction}>
              <input type="hidden" name="activityId" value={a.id} />
              <button style={{ marginTop: 0 }}>
                {a.polishedDescription ? "Re-polish with AI" : "Polish with AI"}
              </button>
            </form>
            <form action={deleteActivityAction}>
              <input type="hidden" name="activityId" value={a.id} />
              <button style={{ marginTop: 0 }}>Delete</button>
            </form>
          </div>

          {a.polishedDescription && (
            <form action={approveActivityAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="activityId" value={a.id} />
              <label>AI draft (edit freely, max 150 chars) — approve to use</label>
              <textarea
                name="polishedDescription"
                maxLength={150}
                defaultValue={a.polishedDescription}
              />
              <button className="good" type="submit">
                Approve for autofill
              </button>
            </form>
          )}
        </div>
      ))}

      <div className="card">
        <h2>Add an activity</h2>
        <form action={addActivityAction}>
          <div className="row">
            <div style={{ flex: "1 1 200px" }}>
              <label>Category</label>
              <input name="category" placeholder="e.g. Community Service" />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label>Position / role</label>
              <input name="position" placeholder="e.g. Founder" />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label>Organization</label>
              <input name="organization" />
            </div>
          </div>
          <div className="row">
            <div style={{ flex: "1 1 120px" }}>
              <label>Hours/week</label>
              <input name="hoursPerWeek" type="number" />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label>Weeks/year</label>
              <input name="weeksPerYear" type="number" />
            </div>
          </div>
          <label>Describe it in your own words</label>
          <textarea name="rawDescription" required />
          <button className="primary" type="submit">Add activity</button>
        </form>
      </div>
    </main>
  );
}
