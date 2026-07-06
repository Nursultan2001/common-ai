import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import {
  addActivityAction,
  polishActivityAction,
  approveActivityAction,
  deleteActivityAction,
  saveResponsibilitiesAction,
} from "@/lib/actions/content";

export const dynamic = "force-dynamic";

// Exact Common App option lists (harvested live).
const ACTIVITY_TYPES = [
  "Academic", "Art", "Athletics: Club", "Athletics: JV/Varsity", "Career Oriented",
  "Community Service (Volunteer)", "Computer/Technology", "Cultural", "Dance",
  "Debate/Speech", "Environmental", "Family Responsibilities", "Foreign Exchange",
  "Foreign Language", "Internship", "Journalism/Publication", "Junior R.O.T.C.",
  "LGBT", "Music: Instrumental", "Music: Vocal", "Religious", "Research", "Robotics",
  "School Spirit", "Science/Math", "Social Justice", "Student Govt./Politics",
  "Theater/Drama", "Work (Paid)", "Other Club/Activity",
];
const RESPONSIBILITIES = [
  "Assisting family or household members with tasks such as doctors’ appointments, bank visits, or visa interviews",
  "Farm work or unpaid work for a family business",
  "Interpreting or translating for family or household members",
  "Managing family or household finances, budget, or paying bills",
  "Providing transportation for family or household members",
  "Taking care of sick, disabled, and/or elderly members of my family or household",
  "Taking care of younger family or household members",
  "Taking care of my own child or children",
  "Working at a paid job to contribute to my household’s income",
  "Other",
  "None of these",
];
const CIRCUMSTANCES = [
  "Commuting 60 minutes or more to and from school each day",
  "Experiencing homelessness or another unstable living situation",
  "Living without consistent heat, power, water, or access to food",
  "Living without reliable or usable internet",
  "Living independently or living on my own (not including boarding school)",
  "None of these",
];

export default async function ActivitiesPage({ searchParams }: { searchParams: { aiError?: string } }) {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const [activities, profile] = await Promise.all([
    db.activity.findMany({
      where: { applicantId: applicant.id },
      orderBy: { createdAt: "asc" },
    }),
    db.masterProfile.findUnique({ where: { applicantId: applicant.id } }),
  ]);
  const pickedResp = (profile?.responsibilities ?? "").split("||").map((s) => s.trim());
  const pickedCirc = (profile?.circumstances ?? "").split("||").map((s) => s.trim());

  return (
    <main>
      <h1>Activities</h1>
      {searchParams.aiError && (
        <div className="card" style={{ borderColor: "rgba(255,107,122,.5)", background: "rgba(255,77,99,.08)" }}>
          <strong>AI is temporarily unavailable.</strong>{" "}
          <span className="muted">Your activity was saved. Try “Polish with AI” again shortly; if it persists, an admin needs a valid <code>ANTHROPIC_API_KEY</code>.</span>
        </div>
      )}
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
            <div style={{ flex: "1 1 220px" }}>
              <label>Activity type</label>
              <select name="category" defaultValue="">
                <option value="">— Choose an option —</option>
                {ACTIVITY_TYPES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label>Position / leadership (max 50)</label>
              <input name="position" maxLength={50} placeholder="e.g. Founder" />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label>Organization name (max 100)</label>
              <input name="organization" maxLength={100} />
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
            <div style={{ flex: "1 1 200px" }}>
              <label>Intend to continue in college?</label>
              <select name="collegeIntent" defaultValue="">
                <option value="">—</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          </div>
          <label>Grade levels (when you participated)</label>
          <div className="row">
            {["9", "10", "11", "12", "Post-graduate"].map((g) => (
              <label key={g} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" name="gradeLevels" value={g} style={{ width: "auto" }} /> {g}
              </label>
            ))}
          </div>
          <label>Timing</label>
          <div className="row">
            {["During school year", "During school break", "All year"].map((tm) => (
              <label key={tm} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" name="timing" value={tm} style={{ width: "auto" }} /> {tm}
              </label>
            ))}
          </div>
          <label>Describe it in your own words</label>
          <textarea name="rawDescription" required />
          <button className="primary" type="submit">Add activity</button>
        </form>
      </div>

      <div className="card">
        <h2>Responsibilities &amp; circumstances</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Optional. Common App’s “Responsibilities and circumstances” page — check
          anything that applies; the extension fills these on Common App. Leave all
          blank if none apply (the page lets you pick “None of these”).
        </p>
        <form action={saveResponsibilitiesAction}>
          <label>Responsibilities you spend 4+ hours/week doing</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {RESPONSIBILITIES.map((o) => (
              <label key={o} style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" name="responsibilities" value={o}
                  defaultChecked={pickedResp.includes(o)} style={{ width: "auto", marginTop: 4 }} /> {o}
              </label>
            ))}
          </div>
          <label style={{ marginTop: 12 }}>Circumstances you’ve experienced</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CIRCUMSTANCES.map((o) => (
              <label key={o} style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" name="circumstances" value={o}
                  defaultChecked={pickedCirc.includes(o)} style={{ width: "auto", marginTop: 4 }} /> {o}
              </label>
            ))}
          </div>
          <button className="primary" type="submit">Save responsibilities</button>
        </form>
      </div>
    </main>
  );
}
