import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { saveTestingAction } from "@/lib/actions/testing";

export const dynamic = "force-dynamic";

// Exact Common App "Tests Taken" (2/2) multi-select options.
const TESTS = [
  "ACT Tests", "SAT Tests", "SAT Subject Tests", "AP Subject Tests",
  "IB Subject Tests", "Cambridge", "TOEFL iBT", "PTE Academic Test",
  "IELTS", "Duolingo English Test",
];

function isoDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function TestingPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const t = await db.testScores.findUnique({ where: { applicantId: applicant.id } });

  return (
    <main>
      <h1>Testing</h1>
      <p className="muted">
        Self-reported test scores. IELTS-focused for now (we’ll add SAT/ACT/AP
        next). One IELTS test date is applied to all sub-scores on Common App.
      </p>

      <form action={saveTestingAction}>
        <div className="card">
          <h2>General</h2>
          <div className="row">
            <div style={{ flex: "1 1 260px" }}>
              <label>Do you wish to self-report scores or future test dates?</label>
              <select name="selfReportScores" defaultValue={t?.selfReportScores ?? ""}>
                <option value="">—</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
            <div style={{ flex: "1 1 260px" }}>
              <label>International: promotion based on standard leaving exams?</label>
              <select name="internationalLeavingExam" defaultValue={t?.internationalLeavingExam ?? ""}>
                <option value="">—</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          </div>
          <label style={{ marginTop: 12 }}>Tests you wish to report (check all that apply)</label>
          <div className="row">
            {TESTS.map((o) => {
              const picked = (t?.testsToReport ?? "").split(",").map((x) => x.trim());
              return (
                <label key={o} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" name="testsToReport" value={o}
                    defaultChecked={picked.includes(o)} style={{ width: "auto" }} /> {o}
                </label>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>IELTS</h2>
          <div className="row">
            <div style={{ flex: "1 1 180px" }}>
              <label>Times taken</label>
              <input name="ieltsTimesTaken" type="number" defaultValue={t?.ieltsTimesTaken ?? ""} />
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label>Test date (applies to all scores)</label>
              <input name="ieltsDate" type="date" defaultValue={isoDate(t?.ieltsDate ?? null)} />
            </div>
          </div>
          <div className="row">
            <div style={{ flex: "1 1 120px" }}>
              <label>Listening</label>
              <input name="ieltsListening" defaultValue={t?.ieltsListening ?? ""} placeholder="e.g. 7.5" />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label>Reading</label>
              <input name="ieltsReading" defaultValue={t?.ieltsReading ?? ""} />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label>Writing</label>
              <input name="ieltsWriting" defaultValue={t?.ieltsWriting ?? ""} />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label>Speaking</label>
              <input name="ieltsSpeaking" defaultValue={t?.ieltsSpeaking ?? ""} />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label>Overall band</label>
              <input name="ieltsOverall" defaultValue={t?.ieltsOverall ?? ""} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Senior Secondary Leaving Examinations</h2>
          <label>Number you have already taken</label>
          <input name="ssleCount" type="number" defaultValue={t?.ssleCount ?? ""} style={{ maxWidth: 220 }} />
        </div>

        <button className="primary" type="submit">Save testing</button>
      </form>
    </main>
  );
}
