import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import {
  addHonorAction,
  polishHonorAction,
  approveHonorAction,
  deleteHonorAction,
} from "@/lib/actions/content";

export const dynamic = "force-dynamic";

// Exact Common App honors options (page 4/25).
const GRADE_LEVELS = ["9", "10", "11", "12", "Post-graduate"];
const RECOGNITION = ["School", "State/Regional", "National", "International"];

function CheckRow({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <div style={{ flex: "1 1 100%" }}>
      <label>{label}</label>
      <div className="row">
        {options.map((o) => (
          <label key={o} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name={name} value={o} style={{ width: "auto" }} /> {o}
          </label>
        ))}
      </div>
    </div>
  );
}

export default async function HonorsPage({ searchParams }: { searchParams: { aiError?: string } }) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const honors = await db.honor.findMany({
    where: { applicantId: applicant.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main>
      <h1>Honors &amp; awards</h1>
      {searchParams.aiError && (
        <div className="card" style={{ borderColor: "rgba(255,107,122,.5)", background: "rgba(255,77,99,.08)" }}>
          <strong>AI is temporarily unavailable.</strong>{" "}
          <span className="muted">Your honor was saved. Try “Polish with AI” again shortly; if it persists, an admin needs a valid <code>ANTHROPIC_API_KEY</code>.</span>
        </div>
      )}
      <p className="muted">
        Add each honor (Common App allows up to 5), with the grade level(s) and
        level(s) of recognition. The extension reports honors = Yes, clicks “Add
        another honors” for each one, and fills the title and checkboxes. AI
        clarifies each title to the 100-character limit using only your facts —
        you review and approve.
      </p>

      {honors.map((h) => (
        <div className="card" key={h.id}>
          <div className="row">
            <strong>{h.title}</strong>
            {h.gradeLevels && <span className="muted">Grades: {h.gradeLevels}</span>}
            {h.level && <span className="muted">{h.level}</span>}
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
            <div style={{ flex: "1 1 100%" }}>
              <label>Title</label>
              <input name="title" required />
            </div>
          </div>
          <div className="row">
            <CheckRow label="Grade level(s)" name="gradeLevels" options={GRADE_LEVELS} />
          </div>
          <div className="row">
            <CheckRow label="Level(s) of recognition" name="level" options={RECOGNITION} />
          </div>
          <label>Context (in your own words)</label>
          <textarea name="rawDescription" />
          <button className="primary" type="submit">Add honor</button>
        </form>
      </div>
    </main>
  );
}
