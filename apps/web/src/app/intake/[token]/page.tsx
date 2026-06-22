import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { INTAKE_STEPS } from "@/lib/intake";
import {
  saveIntakePersonal, saveIntakeContact, saveIntakeCitizenship, saveIntakeEducation,
  saveIntakeHousehold, saveIntakeParent, addIntakeSibling, deleteIntakeSibling,
  addIntakeLanguage, deleteIntakeLanguage, saveIntakeTesting,
  addIntakeActivity, deleteIntakeActivity, addIntakeHonor, deleteIntakeHonor, submitIntake,
} from "@/lib/actions/intake";

export const dynamic = "force-dynamic";

// ---- tiny field helpers (server components, no hooks) ----
function F({ label, name, value, type = "text", flex = "1 1 200px" }:
  { label: string; name: string; value?: string | number | null; type?: string; flex?: string }) {
  return (
    <div style={{ flex }}>
      <label>{label}</label>
      <input name={name} type={type} defaultValue={value ?? ""} />
    </div>
  );
}
function Sel({ label, name, value, options, flex = "1 1 200px" }:
  { label: string; name: string; value?: string | null; options: string[]; flex?: string }) {
  return (
    <div style={{ flex }}>
      <label>{label}</label>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Checks({ label, name, value, options }:
  { label: string; name: string; value?: string | null; options: string[] }) {
  const picked = (value ?? "").split(",").map((s) => s.trim());
  return (
    <div style={{ flex: "1 1 100%" }}>
      <label>{label}</label>
      <div className="row">
        {options.map((o) => (
          <label key={o} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name={name} value={o} defaultChecked={picked.includes(o)} style={{ width: "auto" }} /> {o}
          </label>
        ))}
      </div>
    </div>
  );
}
const iso = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

const YESNO = ["Yes", "No"];
const SUFFIX = ["Jr.", "Sr.", "II", "III", "IV", "V"];
const GENDER = ["Female", "Male", "Nonbinary"];
const LEGALSEX = ["Female", "Male", "X or another legal sex"];
const PRONOUNS = ["He/Him", "She/Her", "They/Them"];
const ARMED = ["None", "Currently Serving", "Previously Served", "Current Dependent"];
const RACE = ["American Indian or Alaska Native", "Asian", "Black or African American", "Native Hawaiian or Other Pacific Islander", "White"];
const CITIZEN = ["U.S. Citizen or U.S. National", "U.S. Dual Citizen", "U.S. Permanent Resident", "Other (non-U.S.)", "Undocumented", "Refugee or asylee", "DACA"];
const HSTYPE = ["Public", "Charter", "Religious", "Home school", "Independent"];
const RANK = ["Exact", "Decile", "Quintile", "Quartile", "None"];
const WEIGHT = ["Weighted", "Unweighted"];
const PROFIC = ["First Language", "Speak", "Read", "Write", "Spoken at Home"];
const MARITAL = ["Married", "Divorced", "Separated", "Widowed", "Never married", "Civil union/Domestic partners", "Other"];
const HOMEWITH = ["Both Parents", "Parent 1", "Parent 2", "Guardian", "Ward of the court/state", "Other"];
const PARENTTYPE = ["Mother", "Father", "I have limited information about this parent"];
const EMPLOY = ["Employed", "Unemployed", "Retired", "Self-Employed"];
const PEDU = ["Some high/secondary school", "Graduated from high/secondary school (or equivalent)", "Some college/university", "Graduated from college/university", "Graduate school"];
const TESTS = ["ACT Tests", "SAT Tests", "AP Subject Tests", "IB Subject Tests", "Cambridge", "TOEFL iBT", "PTE Academic Test", "IELTS", "Duolingo English Test"];
const GRADES = ["9", "10", "11", "12", "Post-graduate"];
const TIMING = ["During school year", "During school break", "All year"];
const HLEVEL = ["School", "State/Regional", "National", "International"];

export default async function IntakePage({
  params, searchParams,
}: { params: { token: string }; searchParams: { step?: string } }) {
  const token = params.token;
  const applicant = await db.applicant.findUnique({
    where: { intakeToken: token },
    include: {
      profile: true, parents: { orderBy: { order: "asc" } }, siblings: { orderBy: { order: "asc" } },
      languages: { orderBy: { order: "asc" } }, testScores: true,
      activities: { orderBy: { createdAt: "asc" } }, honors: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!applicant) notFound();

  const p = applicant.profile;
  const t = applicant.testScores;
  const step = INTAKE_STEPS.find((s) => s.key === (searchParams.step || "personal")) ? (searchParams.step || "personal") : "personal";
  const idx = INTAKE_STEPS.findIndex((s) => s.key === step);
  const nextKey = INTAKE_STEPS[idx + 1]?.key;
  const Tok = () => <input type="hidden" name="token" value={token} />;
  const NextLink = () => nextKey ? (
    <Link className="primary" style={{ display: "inline-block", marginTop: 12, padding: "10px 16px", borderRadius: 10 }}
      href={`/intake/${token}?step=${nextKey}`}>Next →</Link>
  ) : null;

  return (
    <main className="auth-page" style={{ maxWidth: 880, margin: "0 auto", padding: "28px 18px" }}>
      <h1 style={{ marginBottom: 4 }}>College application intake</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {applicant.intakeClientName ? `For ${applicant.intakeClientName}. ` : ""}
        Fill what you can — it saves automatically and your counselor takes it from here.
        {applicant.intakeSubmittedAt ? " ✓ Submitted — you can still edit." : ""}
      </p>

      {/* progress chips */}
      <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "10px 0 18px" }}>
        {INTAKE_STEPS.map((s, i) => (
          <Link key={s.key} href={`/intake/${token}?step=${s.key}`}
            className={`badge ${s.key === step ? "paid" : "locked"}`}
            style={{ textDecoration: "none", fontWeight: s.key === step ? 700 : 500 }}>
            {i + 1}. {s.label}
          </Link>
        ))}
      </div>

      {step === "personal" && (
        <div className="card">
          <h2>Personal</h2>
          <form action={saveIntakePersonal}>
            <Tok />
            <div className="row">
              <F label="Legal first name" name="legalFirstName" value={p?.legalFirstName} />
              <F label="Middle name" name="middleName" value={p?.middleName} />
              <F label="Legal last name" name="legalLastName" value={p?.legalLastName} />
              <Sel label="Suffix" name="suffix" value={p?.suffix} options={SUFFIX} flex="1 1 100px" />
            </div>
            <div className="row">
              <F label="Preferred first name" name="preferredName" value={p?.preferredName} />
              <Sel label="Share a different first name?" name="sharePreferredName" value={p?.sharePreferredName} options={YESNO} />
              <Sel label="Materials under a former name?" name="hasFormerName" value={p?.hasFormerName} options={YESNO} />
              <F label="Former last name" name="formerLastName" value={p?.formerLastName} />
            </div>
            <div className="row">
              <F label="Date of birth" name="dateOfBirth" type="date" value={iso(p?.dateOfBirth)} />
              <F label="City of birth" name="birthCity" value={p?.birthCity} />
              <F label="Country of birth" name="birthCountry" value={p?.birthCountry} />
            </div>
            <div className="row"><Checks label="Gender" name="gender" value={p?.gender} options={GENDER} /></div>
            <div className="row">
              <Sel label="Legal sex" name="legalSex" value={p?.legalSex} options={LEGALSEX} />
              <Sel label="U.S. Armed Forces status" name="armedForces" value={p?.armedForces} options={ARMED} />
              <Sel label="Hispanic or Latino/a/x?" name="hispanicLatino" value={p?.hispanicLatino} options={YESNO} />
            </div>
            <div className="row"><Checks label="Pronouns" name="pronouns" value={p?.pronouns} options={PRONOUNS} /></div>
            <div className="row"><Checks label="How do you identify? (race/ethnicity)" name="raceEthnicity" value={p?.raceEthnicity} options={RACE} /></div>
            <button className="primary" type="submit">Save &amp; continue →</button>
          </form>
        </div>
      )}

      {step === "contact" && (
        <div className="card">
          <h2>Contact &amp; address</h2>
          <form action={saveIntakeContact}>
            <Tok />
            <div className="row">
              <F label="Email" name="email" type="email" value={p?.email} />
              <Sel label="Phone type" name="phoneType" value={p?.phoneType} options={["Mobile", "Home"]} flex="1 1 120px" />
              <F label="Phone country (e.g. Kazakhstan)" name="phoneCountryCode" value={p?.phoneCountryCode} />
              <F label="Phone number" name="phone" type="tel" value={p?.phone} />
            </div>
            <div className="row">
              <Sel label="Alternate phone" name="alternatePhone" value={p?.alternatePhone} options={["No other telephone", "Home", "Mobile"]} />
              <F label="Alt. country" name="alternatePhoneCountryCode" value={p?.alternatePhoneCountryCode} />
              <F label="Alt. number" name="alternatePhoneNumber" value={p?.alternatePhoneNumber} />
            </div>
            <div className="row">
              <F label="Address line 1" name="addressLine1" value={p?.addressLine1} />
              <F label="Address line 2" name="addressLine2" value={p?.addressLine2} />
            </div>
            <div className="row">
              <F label="City" name="city" value={p?.city} />
              <F label="State/Province" name="state" value={p?.state} />
              <F label="Postal/Zip code" name="postalCode" value={p?.postalCode} />
              <F label="Country" name="country" value={p?.country} />
            </div>
            <button className="primary" type="submit">Save &amp; continue →</button>
          </form>
        </div>
      )}

      {step === "citizenship" && (
        <div className="card">
          <h2>Citizenship</h2>
          <form action={saveIntakeCitizenship}>
            <Tok />
            <div className="row">
              <Sel label="Citizenship status" name="citizenshipStatus" value={p?.citizenshipStatus} options={CITIZEN} flex="1 1 320px" />
              <F label="Country of citizenship" name="citizenship" value={p?.citizenship} />
            </div>
            <div className="row">
              <F label="Years lived in the U.S." name="yearsInUS" value={p?.yearsInUS} flex="1 1 160px" />
              <Sel label="Currently hold a U.S. visa?" name="holdsUSVisa" value={p?.holdsUSVisa} options={YESNO} />
              <Sel label="Will you need a U.S. visa?" name="intendsUSVisa" value={p?.intendsUSVisa} options={YESNO} />
              <F label="Visa type (e.g. F-1 Student)" name="visaType" value={p?.visaType} />
            </div>
            <button className="primary" type="submit">Save &amp; continue →</button>
          </form>
        </div>
      )}

      {step === "languages" && (
        <div className="card">
          <h2>Languages</h2>
          {applicant.languages.map((l) => (
            <div className="row" key={l.id} style={{ justifyContent: "space-between" }}>
              <span><strong>{l.name}</strong>{l.proficiency ? <span className="muted"> — {l.proficiency}</span> : null}</span>
              <form action={deleteIntakeLanguage}><Tok /><input type="hidden" name="languageId" value={l.id} /><button style={{ marginTop: 0 }}>Delete</button></form>
            </div>
          ))}
          {applicant.languages.length === 0 && <p className="muted">No languages added.</p>}
          {applicant.languages.length < 5 && (
            <form action={addIntakeLanguage} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row"><F label="Language" name="name" /></div>
              <Checks label="Proficiency" name="proficiency" options={PROFIC} />
              <button type="submit">Add language</button>
            </form>
          )}
          <NextLink />
        </div>
      )}

      {step === "family" && (
        <>
          <div className="card">
            <h2>Household</h2>
            <form action={saveIntakeHousehold}>
              <Tok />
              <div className="row">
                <Sel label="Parents’ marital status" name="parentsMaritalStatus" value={p?.parentsMaritalStatus} options={MARITAL} flex="1 1 240px" />
                <Sel label="You make your permanent home with" name="permanentHomeWith" value={p?.permanentHomeWith} options={HOMEWITH} flex="1 1 240px" />
                <Sel label="Do you have children?" name="hasChildren" value={p?.hasChildren} options={YESNO} />
              </div>
              <button className="primary" type="submit">Save household</button>
            </form>
          </div>
          {[0, 1].map((order) => {
            const par = applicant.parents.find((x) => x.order === order);
            return (
              <div className="card" key={order}>
                <h2>Parent / Guardian {order + 1}</h2>
                <form action={saveIntakeParent}>
                  <Tok /><input type="hidden" name="order" value={order} />
                  <div className="row">
                    <Sel label="Parent type" name="parentType" value={par?.parentType} options={PARENTTYPE} flex="1 1 220px" />
                    <Sel label="Living?" name="isLiving" value={par?.isLiving} options={YESNO} flex="1 1 120px" />
                  </div>
                  <div className="row">
                    <F label="First name" name="firstName" value={par?.firstName} />
                    <F label="Last name" name="lastName" value={par?.lastName} />
                    <F label="Email" name="email" type="email" value={par?.email} />
                  </div>
                  <div className="row">
                    <F label="Phone country" name="phoneCountryCode" value={par?.phoneCountryCode} flex="1 1 140px" />
                    <F label="Phone number" name="phoneNumber" value={par?.phoneNumber} />
                    <Sel label="Employment status" name="employmentStatus" value={par?.employmentStatus} options={EMPLOY} />
                  </div>
                  <div className="row">
                    <F label="Occupation" name="occupation" value={par?.occupation} />
                    <Sel label="Highest education level" name="educationLevel" value={par?.educationLevel} options={PEDU} flex="1 1 260px" />
                  </div>
                  <button className="primary" type="submit">Save parent {order + 1}</button>
                </form>
              </div>
            );
          })}
          <div className="card">
            <h2>Siblings</h2>
            {applicant.siblings.map((s) => (
              <div className="row" key={s.id} style={{ justifyContent: "space-between" }}>
                <span>{[s.firstName, s.lastName].filter(Boolean).join(" ") || "(unnamed)"}{s.ageOrGrade ? ` — ${s.ageOrGrade}` : ""}</span>
                <form action={deleteIntakeSibling}><Tok /><input type="hidden" name="siblingId" value={s.id} /><button style={{ marginTop: 0 }}>Delete</button></form>
              </div>
            ))}
            {applicant.siblings.length === 0 && <p className="muted">No siblings added.</p>}
            <form action={addIntakeSibling} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row">
                <F label="First name" name="firstName" />
                <F label="Last name" name="lastName" />
                <F label="Age / grade" name="ageOrGrade" flex="1 1 140px" />
              </div>
              <button type="submit">Add sibling</button>
            </form>
          </div>
          <NextLink />
        </>
      )}

      {step === "education" && (
        <div className="card">
          <h2>Education</h2>
          <form action={saveIntakeEducation}>
            <Tok />
            <div className="row">
              <F label="High school name" name="highSchoolName" value={p?.highSchoolName} />
              <F label="Date of entry" name="dateOfEntry" type="date" value={iso(p?.dateOfEntry)} />
              <F label="Graduation date" name="graduationDate" type="date" value={iso(p?.graduationDate)} />
              <F label="Graduation year" name="graduationYear" type="number" value={p?.graduationYear} flex="1 1 130px" />
            </div>
            <div className="row">
              <Sel label="School type" name="highSchoolType" value={p?.highSchoolType} options={HSTYPE} />
              <F label="School country" name="highSchoolCountry" value={p?.highSchoolCountry} />
              <F label="School city" name="highSchoolCity" value={p?.highSchoolCity} />
            </div>
            <div className="row">
              <F label="School address" name="highSchoolAddress1" value={p?.highSchoolAddress1} />
              <F label="School state/province" name="highSchoolState" value={p?.highSchoolState} />
              <F label="School zip/postal" name="highSchoolZip" value={p?.highSchoolZip} />
            </div>
            <div className="row">
              <Sel label="Boarding school?" name="isBoardingSchool" value={p?.isBoardingSchool} options={YESNO} />
              <Sel label="Did/will you graduate here?" name="didGraduate" value={p?.didGraduate} options={YESNO} />
            </div>
            <div className="row">
              <F label="GPA" name="gpa" type="number" value={p?.gpa} flex="1 1 120px" />
              <F label="GPA scale" name="gpaScale" type="number" value={p?.gpaScale} flex="1 1 120px" />
              <F label="Graduating class size" name="classSize" type="number" value={p?.classSize} flex="1 1 160px" />
              <Sel label="Class rank reporting" name="classRankReporting" value={p?.classRankReporting} options={RANK} />
            </div>
            <div className="row">
              <Sel label="Class rank weighting" name="rankWeighting" value={p?.rankWeighting} options={WEIGHT} />
              <Sel label="GPA weighting" name="gpaWeighting" value={p?.gpaWeighting} options={WEIGHT} />
            </div>
            <div className="row">
              <F label="Intended major" name="intendedMajor" value={p?.intendedMajor} />
              <F label="Highest degree intended" name="highestDegree" value={p?.highestDegree} />
              <F label="Career interest" name="careerInterest" value={p?.careerInterest} />
            </div>
            <button className="primary" type="submit">Save &amp; continue →</button>
          </form>
        </div>
      )}

      {step === "testing" && (
        <div className="card">
          <h2>Testing (self-reported)</h2>
          <form action={saveIntakeTesting}>
            <Tok />
            <div className="row">
              <Sel label="Self-report scores or future test dates?" name="selfReportScores" value={t?.selfReportScores} options={YESNO} flex="1 1 280px" />
              <Sel label="International: promotion by leaving exams?" name="internationalLeavingExam" value={t?.internationalLeavingExam} options={YESNO} flex="1 1 280px" />
            </div>
            <Checks label="Tests you wish to report" name="testsToReport" value={t?.testsToReport} options={TESTS} />
            <h3 style={{ marginBottom: 4 }}>SAT (if any)</h3>
            <div className="row">
              <F label="Reading & Writing" name="satReadingWriting" value={t?.satReadingWriting} flex="1 1 150px" />
              <F label="R&W date" name="satReadingWritingDate" type="date" value={iso(t?.satReadingWritingDate)} />
              <F label="Math" name="satMath" value={t?.satMath} flex="1 1 120px" />
              <F label="Math date" name="satMathDate" type="date" value={iso(t?.satMathDate)} />
            </div>
            <h3 style={{ marginBottom: 4 }}>ACT (if any)</h3>
            <div className="row">
              <F label="Composite" name="actComposite" value={t?.actComposite} flex="1 1 120px" />
              <F label="Composite date" name="actCompositeDate" type="date" value={iso(t?.actCompositeDate)} />
            </div>
            <h3 style={{ marginBottom: 4 }}>IELTS (if any)</h3>
            <div className="row">
              <F label="Listening" name="ieltsListening" value={t?.ieltsListening} flex="1 1 100px" />
              <F label="Reading" name="ieltsReading" value={t?.ieltsReading} flex="1 1 100px" />
              <F label="Writing" name="ieltsWriting" value={t?.ieltsWriting} flex="1 1 100px" />
              <F label="Speaking" name="ieltsSpeaking" value={t?.ieltsSpeaking} flex="1 1 100px" />
              <F label="Overall" name="ieltsOverall" value={t?.ieltsOverall} flex="1 1 100px" />
              <F label="Date" name="ieltsDate" type="date" value={iso(t?.ieltsDate)} />
            </div>
            <button className="primary" type="submit">Save &amp; continue →</button>
          </form>
        </div>
      )}

      {step === "activities" && (
        <div className="card">
          <h2>Activities</h2>
          <p className="muted" style={{ marginTop: 0 }}>Up to 10. Describe each in your own words — your counselor polishes it later.</p>
          {applicant.activities.map((a) => (
            <div className="row" key={a.id} style={{ justifyContent: "space-between" }}>
              <span><strong>{a.position || a.organization || "Activity"}</strong>{a.category ? <span className="muted"> — {a.category}</span> : null}</span>
              <form action={deleteIntakeActivity}><Tok /><input type="hidden" name="activityId" value={a.id} /><button style={{ marginTop: 0 }}>Delete</button></form>
            </div>
          ))}
          {applicant.activities.length === 0 && <p className="muted">No activities yet.</p>}
          {applicant.activities.length < 10 && (
            <form action={addIntakeActivity} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row">
                <F label="Category" name="category" />
                <F label="Position / role" name="position" />
                <F label="Organization" name="organization" />
              </div>
              <div className="row">
                <F label="Hours/week" name="hoursPerWeek" type="number" flex="1 1 120px" />
                <F label="Weeks/year" name="weeksPerYear" type="number" flex="1 1 120px" />
                <Sel label="Continue in college?" name="collegeIntent" options={YESNO} />
              </div>
              <Checks label="Grade levels" name="gradeLevels" options={GRADES} />
              <Checks label="Timing" name="timing" options={TIMING} />
              <div className="row"><div style={{ flex: "1 1 100%" }}><label>Describe it (your own words)</label><textarea name="rawDescription" rows={2} /></div></div>
              <button type="submit">Add activity</button>
            </form>
          )}
          <NextLink />
        </div>
      )}

      {step === "honors" && (
        <div className="card">
          <h2>Honors &amp; awards</h2>
          {applicant.honors.map((h) => (
            <div className="row" key={h.id} style={{ justifyContent: "space-between" }}>
              <span><strong>{h.title}</strong>{h.level ? <span className="muted"> — {h.level}</span> : null}</span>
              <form action={deleteIntakeHonor}><Tok /><input type="hidden" name="honorId" value={h.id} /><button style={{ marginTop: 0 }}>Delete</button></form>
            </div>
          ))}
          {applicant.honors.length === 0 && <p className="muted">No honors yet.</p>}
          {applicant.honors.length < 5 && (
            <form action={addIntakeHonor} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row"><F label="Title" name="title" flex="1 1 100%" /></div>
              <Checks label="Grade level(s)" name="gradeLevels" options={GRADES} />
              <Checks label="Level(s) of recognition" name="level" options={HLEVEL} />
              <div className="row"><div style={{ flex: "1 1 100%" }}><label>Context (optional)</label><textarea name="rawDescription" rows={2} /></div></div>
              <button type="submit">Add honor</button>
            </form>
          )}
          <NextLink />
        </div>
      )}

      {step === "review" && (
        <div className="card">
          <h2>Review &amp; submit</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Everything saves as you go. Submitting just tells your counselor you’re
            done — you can still edit afterward.
          </p>
          <ul className="muted" style={{ lineHeight: 1.9 }}>
            <li>Name: <strong>{[p?.legalFirstName, p?.legalLastName].filter(Boolean).join(" ") || "—"}</strong></li>
            <li>Email: <strong>{p?.email || "—"}</strong></li>
            <li>High school: <strong>{p?.highSchoolName || "—"}</strong></li>
            <li>Languages: <strong>{applicant.languages.length}</strong> · Activities: <strong>{applicant.activities.length}</strong> · Honors: <strong>{applicant.honors.length}</strong></li>
          </ul>
          <form action={submitIntake}>
            <Tok />
            <button className="primary" type="submit">
              {applicant.intakeSubmittedAt ? "Re-submit" : "Submit to my counselor"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
