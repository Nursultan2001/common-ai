import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { INTAKE_STEPS } from "@/lib/intake";
import { INTAKE_LANGS, normalizeLang, tr } from "@/lib/intakeI18n";
import {
  saveIntakePersonal, saveIntakeContact, saveIntakeCitizenship, saveIntakeEducation,
  saveIntakeHousehold, saveIntakeParent, addIntakeSibling, deleteIntakeSibling,
  addIntakeLanguage, deleteIntakeLanguage, saveIntakeTesting,
  addIntakeActivity, deleteIntakeActivity, addIntakeHonor, deleteIntakeHonor,
  saveIntakeWriting, submitIntake,
} from "@/lib/actions/intake";
import { PERSONAL_ESSAY_PROMPTS } from "@/lib/essayPrompts";

export const dynamic = "force-dynamic";

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
const fmt = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// Answer options stay ENGLISH (they map to Common App on autofill).
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
}: { params: { token: string }; searchParams: { step?: string; lang?: string } }) {
  const token = params.token;
  const lang = normalizeLang(searchParams.lang);
  const T = tr(lang);
  const applicant = await db.applicant.findUnique({
    where: { intakeToken: token },
    include: {
      profile: true, parents: { orderBy: { order: "asc" } }, siblings: { orderBy: { order: "asc" } },
      languages: { orderBy: { order: "asc" } }, testScores: true,
      activities: { orderBy: { createdAt: "asc" } }, honors: { orderBy: { createdAt: "asc" } },
      essays: { where: { kind: "PERSONAL_STATEMENT" }, take: 1 },
    },
  });
  if (!applicant) notFound();

  const p = applicant.profile;
  const t = applicant.testScores;
  const essay = applicant.essays[0];
  const essayPromptIdx = essay?.prompt ? PERSONAL_ESSAY_PROMPTS.indexOf(essay.prompt) + 1 : 0;
  const step = INTAKE_STEPS.find((s) => s.key === (searchParams.step || "personal")) ? (searchParams.step || "personal") : "personal";
  const idx = INTAKE_STEPS.findIndex((s) => s.key === step);
  const nextKey = INTAKE_STEPS[idx + 1]?.key;
  const href = (s: string) => `/intake/${token}?step=${s}&lang=${lang}`;
  const Tok = () => (<><input type="hidden" name="token" value={token} /><input type="hidden" name="lang" value={lang} /></>);
  const NextLink = () => nextKey ? (
    <Link className="primary" style={{ display: "inline-block", marginTop: 12, padding: "10px 16px", borderRadius: 10 }}
      href={href(nextKey)}>{T.next}</Link>
  ) : null;

  return (
    <main className="auth-page" style={{ maxWidth: 880, margin: "0 auto", padding: "28px 18px" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ marginBottom: 4 }}>{T.pageTitle}</h1>
        <div className="row" style={{ gap: 6 }}>
          {INTAKE_LANGS.map((l) => (
            <Link key={l.code} href={`/intake/${token}?step=${step}&lang=${l.code}`}
              className={`badge ${l.code === lang ? "paid" : "locked"}`}
              style={{ textDecoration: "none", fontWeight: l.code === lang ? 700 : 500 }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {applicant.intakeClientName ? fmt(T.forName, { name: applicant.intakeClientName }) + " " : ""}
        {T.intro}{applicant.intakeSubmittedAt ? " " + T.submitted : ""}
      </p>

      {/* Fill-in-English notice */}
      <div className="card" style={{ borderColor: "rgba(255,180,80,.5)", background: "rgba(255,180,80,.08)", padding: "10px 14px" }}>
        <strong>{T.fillEnglish}</strong>
      </div>

      {/* progress chips */}
      <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "12px 0 18px" }}>
        {INTAKE_STEPS.map((s, i) => (
          <Link key={s.key} href={href(s.key)}
            className={`badge ${s.key === step ? "paid" : "locked"}`}
            style={{ textDecoration: "none", fontWeight: s.key === step ? 700 : 500 }}>
            {i + 1}. {T[`s_${s.key}`]}
          </Link>
        ))}
      </div>

      {step === "personal" && (
        <div className="card">
          <h2>{T.s_personal}</h2>
          <form action={saveIntakePersonal}>
            <Tok />
            <div className="row">
              <F label={T.legalFirst} name="legalFirstName" value={p?.legalFirstName} />
              <F label={T.middle} name="middleName" value={p?.middleName} />
              <F label={T.legalLast} name="legalLastName" value={p?.legalLastName} />
              <Sel label={T.suffix} name="suffix" value={p?.suffix} options={SUFFIX} flex="1 1 100px" />
            </div>
            <div className="row">
              <F label={T.preferredFirst} name="preferredName" value={p?.preferredName} />
              <Sel label={T.shareDifferent} name="sharePreferredName" value={p?.sharePreferredName} options={YESNO} />
              <Sel label={T.materialsFormer} name="hasFormerName" value={p?.hasFormerName} options={YESNO} />
              <F label={T.formerLast} name="formerLastName" value={p?.formerLastName} />
            </div>
            <div className="row">
              <F label={T.dob} name="dateOfBirth" type="date" value={iso(p?.dateOfBirth)} />
              <F label={T.birthCity} name="birthCity" value={p?.birthCity} />
              <F label={T.birthCountry} name="birthCountry" value={p?.birthCountry} />
            </div>
            <div className="row"><Checks label={T.gender} name="gender" value={p?.gender} options={GENDER} /></div>
            <div className="row">
              <Sel label={T.legalSex} name="legalSex" value={p?.legalSex} options={LEGALSEX} />
              <Sel label={T.armed} name="armedForces" value={p?.armedForces} options={ARMED} />
              <Sel label={T.hispanic} name="hispanicLatino" value={p?.hispanicLatino} options={YESNO} />
            </div>
            <div className="row"><Checks label={T.pronouns} name="pronouns" value={p?.pronouns} options={PRONOUNS} /></div>
            <div className="row"><Checks label={T.race} name="raceEthnicity" value={p?.raceEthnicity} options={RACE} /></div>
            <button className="primary" type="submit">{T.saveContinue}</button>
          </form>
        </div>
      )}

      {step === "contact" && (
        <div className="card">
          <h2>{T.s_contact}</h2>
          <form action={saveIntakeContact}>
            <Tok />
            <div className="row">
              <F label={T.email} name="email" type="email" value={p?.email} />
              <Sel label={T.phoneType} name="phoneType" value={p?.phoneType} options={["Mobile", "Home"]} flex="1 1 120px" />
              <F label={T.phoneCountry} name="phoneCountryCode" value={p?.phoneCountryCode} />
              <F label={T.phoneNumber} name="phone" type="tel" value={p?.phone} />
            </div>
            <div className="row">
              <Sel label={T.altPhone} name="alternatePhone" value={p?.alternatePhone} options={["No other telephone", "Home", "Mobile"]} />
              <F label={T.altCountry} name="alternatePhoneCountryCode" value={p?.alternatePhoneCountryCode} />
              <F label={T.altNumber} name="alternatePhoneNumber" value={p?.alternatePhoneNumber} />
            </div>
            <div className="row">
              <F label={T.addr1} name="addressLine1" value={p?.addressLine1} />
              <F label={T.addr2} name="addressLine2" value={p?.addressLine2} />
            </div>
            <div className="row">
              <F label={T.city} name="city" value={p?.city} />
              <F label={T.stateProv} name="state" value={p?.state} />
              <F label={T.postal} name="postalCode" value={p?.postalCode} />
              <F label={T.country} name="country" value={p?.country} />
            </div>
            <button className="primary" type="submit">{T.saveContinue}</button>
          </form>
        </div>
      )}

      {step === "citizenship" && (
        <div className="card">
          <h2>{T.s_citizenship}</h2>
          <form action={saveIntakeCitizenship}>
            <Tok />
            <div className="row">
              <Sel label={T.citStatus} name="citizenshipStatus" value={p?.citizenshipStatus} options={CITIZEN} flex="1 1 320px" />
              <F label={T.citCountry} name="citizenship" value={p?.citizenship} />
            </div>
            <div className="row">
              <F label={T.yearsUS} name="yearsInUS" value={p?.yearsInUS} flex="1 1 160px" />
              <Sel label={T.holdVisa} name="holdsUSVisa" value={p?.holdsUSVisa} options={YESNO} />
              <Sel label={T.needVisa} name="intendsUSVisa" value={p?.intendsUSVisa} options={YESNO} />
              <F label={T.visaType} name="visaType" value={p?.visaType} />
            </div>
            <button className="primary" type="submit">{T.saveContinue}</button>
          </form>
        </div>
      )}

      {step === "languages" && (
        <div className="card">
          <h2>{T.s_languages}</h2>
          {applicant.languages.map((l) => (
            <div className="row" key={l.id} style={{ justifyContent: "space-between" }}>
              <span><strong>{l.name}</strong>{l.proficiency ? <span className="muted"> — {l.proficiency}</span> : null}</span>
              <form action={deleteIntakeLanguage}><Tok /><input type="hidden" name="languageId" value={l.id} /><button style={{ marginTop: 0 }}>{T.del}</button></form>
            </div>
          ))}
          {applicant.languages.length === 0 && <p className="muted">{T.noLanguages}</p>}
          {applicant.languages.length < 5 && (
            <form action={addIntakeLanguage} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row"><F label={T.languageField} name="name" /></div>
              <Checks label={T.proficiency} name="proficiency" options={PROFIC} />
              <button type="submit">{T.addLanguage}</button>
            </form>
          )}
          <NextLink />
        </div>
      )}

      {step === "family" && (
        <>
          <div className="card">
            <h2>{T.household}</h2>
            <form action={saveIntakeHousehold}>
              <Tok />
              <div className="row">
                <Sel label={T.marital} name="parentsMaritalStatus" value={p?.parentsMaritalStatus} options={MARITAL} flex="1 1 240px" />
                <Sel label={T.homeWith} name="permanentHomeWith" value={p?.permanentHomeWith} options={HOMEWITH} flex="1 1 240px" />
                <Sel label={T.haveChildren} name="hasChildren" value={p?.hasChildren} options={YESNO} />
              </div>
              <button className="primary" type="submit">{T.saveHousehold}</button>
            </form>
          </div>
          {[0, 1].map((order) => {
            const par = applicant.parents.find((x) => x.order === order);
            return (
              <div className="card" key={order}>
                <h2>{fmt(T.parentN, { n: order + 1 })}</h2>
                <form action={saveIntakeParent}>
                  <Tok /><input type="hidden" name="order" value={order} />
                  <div className="row">
                    <Sel label={T.parentType} name="parentType" value={par?.parentType} options={PARENTTYPE} flex="1 1 220px" />
                    <Sel label={T.living} name="isLiving" value={par?.isLiving} options={YESNO} flex="1 1 120px" />
                  </div>
                  <div className="row">
                    <F label={T.firstName} name="firstName" value={par?.firstName} />
                    <F label={T.lastName} name="lastName" value={par?.lastName} />
                    <F label={T.parentEmail} name="email" type="email" value={par?.email} />
                  </div>
                  <div className="row">
                    <F label={T.parentPhoneCountry} name="phoneCountryCode" value={par?.phoneCountryCode} flex="1 1 140px" />
                    <F label={T.parentPhoneNumber} name="phoneNumber" value={par?.phoneNumber} />
                    <Sel label={T.employment} name="employmentStatus" value={par?.employmentStatus} options={EMPLOY} />
                  </div>
                  <div className="row">
                    <F label={T.occupation} name="occupation" value={par?.occupation} />
                    <Sel label={T.parentEdu} name="educationLevel" value={par?.educationLevel} options={PEDU} flex="1 1 260px" />
                  </div>
                  <button className="primary" type="submit">{fmt(T.saveParentN, { n: order + 1 })}</button>
                </form>
              </div>
            );
          })}
          <div className="card">
            <h2>{T.siblings}</h2>
            {applicant.siblings.map((s) => (
              <div className="row" key={s.id} style={{ justifyContent: "space-between" }}>
                <span>{[s.firstName, s.lastName].filter(Boolean).join(" ") || "—"}{s.ageOrGrade ? ` — ${s.ageOrGrade}` : ""}</span>
                <form action={deleteIntakeSibling}><Tok /><input type="hidden" name="siblingId" value={s.id} /><button style={{ marginTop: 0 }}>{T.del}</button></form>
              </div>
            ))}
            {applicant.siblings.length === 0 && <p className="muted">{T.noSiblings}</p>}
            <form action={addIntakeSibling} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row">
                <F label={T.firstName} name="firstName" />
                <F label={T.lastName} name="lastName" />
                <F label={T.ageGrade} name="ageOrGrade" flex="1 1 140px" />
              </div>
              <button type="submit">{T.addSibling}</button>
            </form>
          </div>
          <NextLink />
        </>
      )}

      {step === "education" && (
        <div className="card">
          <h2>{T.s_education}</h2>
          <form action={saveIntakeEducation}>
            <Tok />
            <div className="row">
              <F label={T.hsName} name="highSchoolName" value={p?.highSchoolName} />
              <F label={T.dateEntry} name="dateOfEntry" type="date" value={iso(p?.dateOfEntry)} />
              <F label={T.gradDate} name="graduationDate" type="date" value={iso(p?.graduationDate)} />
              <F label={T.gradYear} name="graduationYear" type="number" value={p?.graduationYear} flex="1 1 130px" />
            </div>
            <div className="row">
              <Sel label={T.schoolType} name="highSchoolType" value={p?.highSchoolType} options={HSTYPE} />
              <F label={T.schoolCountry} name="highSchoolCountry" value={p?.highSchoolCountry} />
              <F label={T.schoolCity} name="highSchoolCity" value={p?.highSchoolCity} />
            </div>
            <div className="row">
              <F label={T.schoolAddress} name="highSchoolAddress1" value={p?.highSchoolAddress1} />
              <F label={T.schoolState} name="highSchoolState" value={p?.highSchoolState} />
              <F label={T.schoolZip} name="highSchoolZip" value={p?.highSchoolZip} />
            </div>
            <div className="row">
              <Sel label={T.boarding} name="isBoardingSchool" value={p?.isBoardingSchool} options={YESNO} />
              <Sel label={T.gradHere} name="didGraduate" value={p?.didGraduate} options={YESNO} />
            </div>
            <div className="row">
              <F label={T.gpa} name="gpa" type="number" value={p?.gpa} flex="1 1 120px" />
              <F label={T.gpaScale} name="gpaScale" type="number" value={p?.gpaScale} flex="1 1 120px" />
              <F label={T.classSize} name="classSize" type="number" value={p?.classSize} flex="1 1 160px" />
              <Sel label={T.rankReporting} name="classRankReporting" value={p?.classRankReporting} options={RANK} />
            </div>
            <div className="row">
              <Sel label={T.rankWeighting} name="rankWeighting" value={p?.rankWeighting} options={WEIGHT} />
              <Sel label={T.gpaWeighting} name="gpaWeighting" value={p?.gpaWeighting} options={WEIGHT} />
            </div>
            <div className="row">
              <F label={T.major} name="intendedMajor" value={p?.intendedMajor} />
              <F label={T.degree} name="highestDegree" value={p?.highestDegree} />
              <F label={T.career} name="careerInterest" value={p?.careerInterest} />
            </div>
            <button className="primary" type="submit">{T.saveContinue}</button>
          </form>
        </div>
      )}

      {step === "testing" && (
        <div className="card">
          <h2>{T.testingTitle}</h2>
          <form action={saveIntakeTesting}>
            <Tok />
            <div className="row">
              <Sel label={T.selfReport} name="selfReportScores" value={t?.selfReportScores} options={YESNO} flex="1 1 280px" />
              <Sel label={T.intlLeaving} name="internationalLeavingExam" value={t?.internationalLeavingExam} options={YESNO} flex="1 1 280px" />
            </div>
            <Checks label={T.testsReport} name="testsToReport" value={t?.testsToReport} options={TESTS} />
            <h3 style={{ marginBottom: 4 }}>{T.satIfAny}</h3>
            <div className="row">
              <F label={T.satRW} name="satReadingWriting" value={t?.satReadingWriting} flex="1 1 150px" />
              <F label={T.satRWDate} name="satReadingWritingDate" type="date" value={iso(t?.satReadingWritingDate)} />
              <F label={T.satMath} name="satMath" value={t?.satMath} flex="1 1 120px" />
              <F label={T.satMathDate} name="satMathDate" type="date" value={iso(t?.satMathDate)} />
            </div>
            <h3 style={{ marginBottom: 4 }}>{T.actIfAny}</h3>
            <div className="row">
              <F label={T.actComposite} name="actComposite" value={t?.actComposite} flex="1 1 120px" />
              <F label={T.actCompositeDate} name="actCompositeDate" type="date" value={iso(t?.actCompositeDate)} />
            </div>
            <h3 style={{ marginBottom: 4 }}>{T.ieltsIfAny}</h3>
            <div className="row">
              <F label={T.listening} name="ieltsListening" value={t?.ieltsListening} flex="1 1 100px" />
              <F label={T.reading} name="ieltsReading" value={t?.ieltsReading} flex="1 1 100px" />
              <F label={T.writing} name="ieltsWriting" value={t?.ieltsWriting} flex="1 1 100px" />
              <F label={T.speaking} name="ieltsSpeaking" value={t?.ieltsSpeaking} flex="1 1 100px" />
              <F label={T.overall} name="ieltsOverall" value={t?.ieltsOverall} flex="1 1 100px" />
              <F label={T.dateField} name="ieltsDate" type="date" value={iso(t?.ieltsDate)} />
            </div>
            <button className="primary" type="submit">{T.saveContinue}</button>
          </form>
        </div>
      )}

      {step === "activities" && (
        <div className="card">
          <h2>{T.activitiesTitle}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{T.actHelper}</p>
          {applicant.activities.map((a) => (
            <div className="row" key={a.id} style={{ justifyContent: "space-between" }}>
              <span><strong>{a.position || a.organization || "Activity"}</strong>{a.category ? <span className="muted"> — {a.category}</span> : null}</span>
              <form action={deleteIntakeActivity}><Tok /><input type="hidden" name="activityId" value={a.id} /><button style={{ marginTop: 0 }}>{T.del}</button></form>
            </div>
          ))}
          {applicant.activities.length === 0 && <p className="muted">{T.noActivities}</p>}
          {applicant.activities.length < 10 && (
            <form action={addIntakeActivity} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row">
                <F label={T.category} name="category" />
                <F label={T.position} name="position" />
                <F label={T.organization} name="organization" />
              </div>
              <div className="row">
                <F label={T.hoursWeek} name="hoursPerWeek" type="number" flex="1 1 120px" />
                <F label={T.weeksYear} name="weeksPerYear" type="number" flex="1 1 120px" />
                <Sel label={T.continueCollege} name="collegeIntent" options={YESNO} />
              </div>
              <Checks label={T.gradeLevels} name="gradeLevels" options={GRADES} />
              <Checks label={T.timing} name="timing" options={TIMING} />
              <div className="row"><div style={{ flex: "1 1 100%" }}><label>{T.describeOwn}</label><textarea name="rawDescription" rows={2} /></div></div>
              <button type="submit">{T.addActivity}</button>
            </form>
          )}
          <NextLink />
        </div>
      )}

      {step === "honors" && (
        <div className="card">
          <h2>{T.honorsTitle}</h2>
          {applicant.honors.map((h) => (
            <div className="row" key={h.id} style={{ justifyContent: "space-between" }}>
              <span><strong>{h.title}</strong>{h.level ? <span className="muted"> — {h.level}</span> : null}</span>
              <form action={deleteIntakeHonor}><Tok /><input type="hidden" name="honorId" value={h.id} /><button style={{ marginTop: 0 }}>{T.del}</button></form>
            </div>
          ))}
          {applicant.honors.length === 0 && <p className="muted">{T.noHonors}</p>}
          {applicant.honors.length < 5 && (
            <form action={addIntakeHonor} style={{ marginTop: 12 }}>
              <Tok />
              <div className="row"><F label={T.titleField} name="title" flex="1 1 100%" /></div>
              <Checks label={T.gradeLevelsH} name="gradeLevels" options={GRADES} />
              <Checks label={T.recognition} name="level" options={HLEVEL} />
              <div className="row"><div style={{ flex: "1 1 100%" }}><label>{T.contextOptional}</label><textarea name="rawDescription" rows={2} /></div></div>
              <button type="submit">{T.addHonor}</button>
            </form>
          )}
          <NextLink />
        </div>
      )}

      {step === "writing" && (
        <div className="card">
          <h2>{T.writingTitle}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{T.essayHelp}</p>
          <form action={saveIntakeWriting}>
            <Tok />
            <label>{T.choosePrompt}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {PERSONAL_ESSAY_PROMPTS.map((pr, i) => (
                <label key={i} style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input type="radio" name="promptIndex" value={i + 1} defaultChecked={essayPromptIdx === i + 1} style={{ width: "auto", marginTop: 4 }} />
                  <span style={{ fontSize: 13 }}>{pr}</span>
                </label>
              ))}
            </div>
            <label>{T.essayLabel}</label>
            <textarea name="essayText" rows={12} defaultValue={essay?.draft ?? essay?.studentNotes ?? ""} />
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: "1 1 100%" }}>
                <label>{T.addlInfoLabel}</label>
                <textarea name="addlInfoText" rows={3} defaultValue={p?.addlInfoText ?? ""} />
              </div>
            </div>
            <div className="row">
              <div style={{ flex: "1 1 100%" }}>
                <label>{T.addlQualLabel}</label>
                <textarea name="addlQualificationsText" rows={3} defaultValue={p?.addlQualificationsText ?? ""} />
              </div>
            </div>
            <button className="primary" type="submit">{T.saveContinue}</button>
          </form>
        </div>
      )}

      {step === "review" && (
        <div className="card">
          <h2>{T.reviewTitle}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{T.reviewHelper}</p>
          <ul className="muted" style={{ lineHeight: 1.9 }}>
            <li>{T.rName}: <strong>{[p?.legalFirstName, p?.legalLastName].filter(Boolean).join(" ") || "—"}</strong></li>
            <li>{T.rEmail}: <strong>{p?.email || "—"}</strong></li>
            <li>{T.rHS}: <strong>{p?.highSchoolName || "—"}</strong></li>
            <li>{fmt(T.rCounts, { l: applicant.languages.length, a: applicant.activities.length, h: applicant.honors.length })}</li>
          </ul>
          <form action={submitIntake}>
            <Tok />
            <button className="primary" type="submit">
              {applicant.intakeSubmittedAt ? T.resubmit : T.submitCounselor}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
