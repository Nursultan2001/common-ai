import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent, getActiveApplicant } from "@/lib/server-auth";
import { saveTestingAction } from "@/lib/actions/testing";

export const dynamic = "force-dynamic";

// Exact Common App "Tests Taken" (2/2) multi-select options.
const TESTS = [
  "ACT Tests", "SAT Tests", "SAT Subject Tests", "AP Subject Tests",
  "IB Subject Tests", "Cambridge", "TOEFL iBT", "PTE Academic Test",
  "IELTS", "Duolingo English Test",
];

// ACT score ranges (composite & sections 1–36, writing 2–12).
const ACT_SCORES = Array.from({ length: 36 }, (_, i) => String(36 - i));
const ACT_WRITING = Array.from({ length: 11 }, (_, i) => String(12 - i));
// SAT ranges: sections 200–800 (step 10); combined essay 6–24.
const SAT_SECTION = Array.from({ length: 61 }, (_, i) => String(800 - i * 10));
const SAT_ESSAY = Array.from({ length: 19 }, (_, i) => String(24 - i));

function isoDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

function ScoreSel({ label, name, value, options }:
  { label: string; name: string; value?: string | null; options: string[] }) {
  return (
    <div style={{ flex: "1 1 150px" }}>
      <label>{label}</label>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
function DateInp({ label, name, value }:
  { label: string; name: string; value?: Date | null }) {
  return (
    <div style={{ flex: "1 1 180px" }}>
      <label>{label}</label>
      <input name={name} type="date" defaultValue={isoDate(value ?? null)} />
    </div>
  );
}
function YesNo({ label, name, value }:
  { label: string; name: string; value?: string | null }) {
  return (
    <div style={{ flex: "1 1 200px" }}>
      <label>{label}</label>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        <option>Yes</option>
        <option>No</option>
      </select>
    </div>
  );
}

export default async function TestingPage() {
  const user = await requireUser();
  const applicant = await getActiveApplicant();
  const t = await db.testScores.findUnique({ where: { applicantId: applicant.id } });

  return (
    <main>
      <h1>Testing</h1>
      <p className="muted">
        Self-reported test scores. Fill the tests that apply to you — the
        extension reports them and fills each score and date on Common App.
        (One IELTS test date is applied to all IELTS sub-scores.)
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
          <h2>SAT</h2>
          <div className="row">
            <ScoreSel label="Number of past SAT scores to report" name="satPastCount"
              value={t?.satPastCount} options={["0", "1", "2", "3", "4", "5"]} />
            <ScoreSel label="Number of future SAT sittings expected" name="satFutureSittings"
              value={t?.satFutureSittings} options={["0", "1", "2", "3"]} />
          </div>
          <div className="row">
            <DateInp label="Future testing date 1" name="satFutureDate1" value={t?.satFutureDate1} />
            <DateInp label="Future testing date 2" name="satFutureDate2" value={t?.satFutureDate2} />
            <DateInp label="Future testing date 3" name="satFutureDate3" value={t?.satFutureDate3} />
          </div>
          <div className="row">
            <ScoreSel label="Highest Evidence-Based Reading & Writing" name="satReadingWriting"
              value={t?.satReadingWriting} options={SAT_SECTION} />
            <DateInp label="Reading & Writing date" name="satReadingWritingDate" value={t?.satReadingWritingDate} />
          </div>
          <div className="row">
            <ScoreSel label="Highest math score" name="satMath" value={t?.satMath} options={SAT_SECTION} />
            <DateInp label="Math date" name="satMathDate" value={t?.satMathDate} />
          </div>
          <div className="row">
            <ScoreSel label="Report a combined essay score?" name="satEssayReport"
              value={t?.satEssayReport} options={["Yes", "No"]} />
            <ScoreSel label="Highest combined essay score" name="satEssay" value={t?.satEssay} options={SAT_ESSAY} />
            <DateInp label="Combined essay date" name="satEssayDate" value={t?.satEssayDate} />
          </div>
        </div>

        <div className="card">
          <h2>ACT</h2>
          <div className="row">
            <ScoreSel label="Number of past ACT scores to report" name="actPastCount"
              value={t?.actPastCount} options={["0", "1", "2", "3", "4", "5"]} />
            <ScoreSel label="Number of future ACT sittings expected" name="actFutureSittings"
              value={t?.actFutureSittings} options={["0", "1", "2", "3"]} />
          </div>
          <div className="row">
            <ScoreSel label="Highest composite score" name="actComposite" value={t?.actComposite} options={ACT_SCORES} />
            <DateInp label="Composite date" name="actCompositeDate" value={t?.actCompositeDate} />
          </div>
          <div className="row">
            <ScoreSel label="Highest English score" name="actEnglish" value={t?.actEnglish} options={ACT_SCORES} />
            <DateInp label="English date" name="actEnglishDate" value={t?.actEnglishDate} />
          </div>
          <div className="row">
            <ScoreSel label="Highest math score" name="actMath" value={t?.actMath} options={ACT_SCORES} />
            <DateInp label="Math date" name="actMathDate" value={t?.actMathDate} />
          </div>
          <div className="row">
            <ScoreSel label="Highest reading score" name="actReading" value={t?.actReading} options={ACT_SCORES} />
            <DateInp label="Reading date" name="actReadingDate" value={t?.actReadingDate} />
          </div>
          <div className="row">
            <YesNo label="Report an ACT science score?" name="actReportScience" value={t?.actReportScience} />
            <ScoreSel label="Highest science score" name="actScience" value={t?.actScience} options={ACT_SCORES} />
            <DateInp label="Science date" name="actScienceDate" value={t?.actScienceDate} />
          </div>
          <div className="row">
            <YesNo label="Report an ACT writing score?" name="actReportWriting" value={t?.actReportWriting} />
            <ScoreSel label="Highest writing score" name="actWriting" value={t?.actWriting} options={ACT_WRITING} />
            <DateInp label="Writing date" name="actWritingDate" value={t?.actWritingDate} />
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
