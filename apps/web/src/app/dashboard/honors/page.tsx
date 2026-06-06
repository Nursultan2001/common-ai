import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import {
  addHonorAction,
  polishHonorAction,
  approveHonorAction,
  deleteHonorAction,
} from "@/lib/actions/content";

export const dynamic = "force-dynamic";

export default async function HonorsPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const honors = await db.honor.findMany({
    where: { applicantId: applicant.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main>
      <h1>Honors &amp; awards</h1>
      <p className="muted">
        AI clarifies each honor title to the Common App 100-character limit using
        only your facts. You review and approve.
      </p>

      {honors.map((h) => (
        <div className="card" key={h.id}>
          <div className="row">
            <strong>{h.title}</strong>
            <span className="muted">{h.level}</span>
            <span className="spacer" />
            <span className={`badge ${h.status === "APPROVED" ? "paid" : "locked"}`}>
              {h.status}
            </span>
          </div>
          {h.rawDescription && (
            <p className="muted" style={{ marginTop: 8 }}>
              Context: {h.rawDescription}
            </p>
          )}

          <div className="row">
            <form action={polishHonorAction}>
              <input type="hidden" name="honorId" value={h.id} />
              <button style={{ marginTop: 0 }}>
                {h.polishedTitle ? "Re-polish with AI" : "Polish with AI"}
              </button>
            </form>
            <form action={deleteHonorAction}>
              <input type="hidden" name="honorId" value={h.id} />
              <button style={{ marginTop: 0 }}>Delete</button>
            </form>
          </div>

          {h.polishedTitle && (
            <form action={approveHonorAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="honorId" value={h.id} />
              <label>AI draft title (edit freely, max 100 chars)</label>
              <input name="polishedTitle" maxLength={100} defaultValue={h.polishedTitle} />
              <button className="good" type="submit">Approve for autofill</button>
            </form>
          )}
        </div>
      ))}

      <div className="card">
        <h2>Add an honor</h2>
        <form action={addHonorAction}>
          <div className="row">
            <div style={{ flex: "1 1 260px" }}>
              <label>Title</label>
              <input name="title" required />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label>Recognition level</label>
              <select name="level">
                <option value="">—</option>
                <option>School</option>
                <option>Regional</option>
                <option>State</option>
                <option>National</option>
                <option>International</option>
              </select>
            </div>
          </div>
          <label>Context (in your own words)</label>
          <textarea name="rawDescription" />
          <button className="primary" type="submit">Add honor</button>
        </form>
      </div>
    </main>
  );
}
