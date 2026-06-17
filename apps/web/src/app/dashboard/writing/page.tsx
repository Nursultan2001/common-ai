import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import {
  saveEssayAction,
  generateEssayAction,
  refineEssayAction,
  approveEssayAction,
} from "@/lib/actions/content";
import {
  PERSONAL_ESSAY_PROMPTS,
  PERSONAL_ESSAY_WORD_LIMIT,
} from "@/lib/essayPrompts";

export const dynamic = "force-dynamic";

const wordCount = (s?: string | null) =>
  (s ?? "").trim() ? (s ?? "").trim().split(/\s+/).length : 0;

export default async function WritingPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const essay = await db.essay.findFirst({
    where: { applicantId: applicant.id, kind: "PERSONAL_STATEMENT" },
  });
  const selectedIndex = essay?.prompt
    ? PERSONAL_ESSAY_PROMPTS.indexOf(essay.prompt) + 1
    : 0;

  return (
    <main>
      <h1>Personal essay</h1>
      <p className="muted">
        Your Common App personal statement ({PERSONAL_ESSAY_WORD_LIMIT}-word max,
        250 min). You choose a prompt and tell us your real story; the AI coach
        shapes it using <em>only</em> what you provide — applying what works in
        strong US college essays (a specific moment, a vivid hook, honest
        reflection, your own voice). <strong>You</strong> edit and approve it. It
        must remain your own work.
      </p>

      <form action={saveEssayAction}>
        <div className="card">
          <h2>1. Choose your prompt</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PERSONAL_ESSAY_PROMPTS.map((p, i) => (
              <label key={i} style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="promptIndex"
                  value={i + 1}
                  defaultChecked={selectedIndex === i + 1}
                  style={{ width: "auto", marginTop: 4 }}
                />
                <span>{p}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>2. Tell your story — in your own words</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Brain-dump everything about yourself related to this topic: the
            specific moment, who was there, what you did, what you felt, what
            changed. Real details only — the AI builds from these and never
            invents anything.
          </p>
          <textarea
            name="studentNotes"
            rows={8}
            defaultValue={essay?.studentNotes ?? ""}
            placeholder="The day my grandmother's bakery flooded, I…"
          />
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" style={{ marginTop: 0 }}>Save</button>
            <button className="primary" type="submit" formAction={generateEssayAction} style={{ marginTop: 0 }}>
              Generate a draft from my notes
            </button>
          </div>
        </div>

        <div className="card">
          <h2>3. …or write your own draft, and let AI improve it</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Prefer to write it yourself first? Paste your draft here and the coach
            will sharpen the hook, cut clichés, deepen the reflection, and tighten
            it — keeping your voice and facts. Current draft:{" "}
            <strong>{wordCount(essay?.draft)}</strong> words.
          </p>
          <textarea
            name="draft"
            rows={12}
            defaultValue={essay?.draft ?? ""}
            placeholder="Write or paste your essay here…"
          />
          <button className="primary" type="submit" formAction={refineEssayAction} style={{ marginTop: 0 }}>
            Improve my draft with AI
          </button>
        </div>
      </form>

      {essay?.outline && (
        <div className="card">
          <h2>Coach notes</h2>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }} className="muted">
            {essay.outline}
          </pre>
        </div>
      )}

      <div className="card">
        <h2>4. Review &amp; approve</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Edit the draft below until it’s truly yours, then approve it for
          autofill. Only the approved text is ever used — never an unreviewed AI
          draft.
        </p>
        <form action={approveEssayAction}>
          <label>
            Final essay (250–{PERSONAL_ESSAY_WORD_LIMIT} words) —{" "}
            {wordCount(essay?.finalText ?? essay?.draft)} words
          </label>
          <textarea name="finalText" rows={14} defaultValue={essay?.finalText ?? essay?.draft ?? ""} />
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
            <input type="checkbox" required style={{ width: "auto", marginTop: 4 }} />
            <span>
              I confirm this essay is my own work and honestly reflects my own
              experiences and voice.
            </span>
          </label>
          <button className="good" type="submit">Approve for autofill</button>
          {essay?.status === "APPROVED" && (
            <span className="badge paid" style={{ marginLeft: 10 }}>APPROVED</span>
          )}
        </form>
      </div>
    </main>
  );
}
