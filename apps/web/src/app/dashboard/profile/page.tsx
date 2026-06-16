import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { saveProfileAction } from "@/lib/actions/profile";
import { addLanguageAction, deleteLanguageAction } from "@/lib/actions/languages";
import {
  addOtherSchoolAction,
  updateOtherSchoolAction,
  deleteOtherSchoolAction,
} from "@/lib/actions/otherSchools";
import {
  addCollegeAction,
  updateCollegeAction,
  deleteCollegeAction,
} from "@/lib/actions/colleges";

export const dynamic = "force-dynamic";

const PROFICIENCY = ["First Language", "Speak", "Read", "Write", "Spoken at Home"];

// Exact Common App "Future Plans" (4/197) dropdown/radio options.
const ENROLLMENT_PLANS = [
  "Applying as a first-year student and plan to start college in 2025 or 2026",
  "Planning to start college in 2027",
  "Planning to start college in 2028 or beyond",
  "Already a college student",
];
const DEGREES = [
  "Associate's (AA, AS)", "Bachelor's (BA, BS)", "Master's (MA, MS)",
  "Business (MBA, MAcc)", "Law (JD, LLM)", "Medicine (MD, DO, DVM, DDS)",
  "Doctorate (PhD, EdD, etc)", "Other", "Undecided",
];
const CAREERS = [
  "Accountant or actuary", "Actor or entertainer", "Architect or urban planner",
  "Artist", "Business (clerical)", "Business executive (management, administrator)",
  "Business owner or proprietor", "Business salesperson or buyer", "Chef",
  "Clergy (minister, priest)", "Clergy (other religious)", "Clinical psychologist",
  "College administrator/staff", "College teacher", "Computer programmer or analyst",
  "Conservationist or forester", "Dentist (including orthodontist)",
  "Dietitian or nutritionist", "Engineer", "Farmer or rancher",
  "Foreign service worker (including diplomat)", "Homemaker (full-time)",
  "Hospitality Management (Hotels, Restaurant)", "Interior decorator (including designer)",
  "Lab technician or hygienist", "Laborer", "Law enforcement officer",
  "Lawyer (attorney) or judge", "Military service (career)",
  "Musician (performer, composer)", "Nurse", "Optometrist", "Pharmacist",
  "Physician", "Policymaker/Government", "School counselor",
  "School principal or superintendent", "Scientific researcher", "Skilled trades",
  "Social, welfare, or recreation worker", "Teacher or administrator (elementary)",
  "Teacher or administrator (secondary)", "Therapist (physical, occupational, speech)",
  "Veterinarian", "Writer or journalist", "Other", "Undecided",
];

function isoDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ProfilePage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const p = await db.masterProfile.findUnique({ where: { applicantId: applicant.id } });
  const languages = await db.language.findMany({
    where: { applicantId: applicant.id },
    orderBy: { order: "asc" },
  });
  const otherSchools = await db.otherSchool.findMany({
    where: { applicantId: applicant.id },
    orderBy: { order: "asc" },
  });
  const colleges = await db.college.findMany({
    where: { applicantId: applicant.id },
    orderBy: { order: "asc" },
  });

  const F = ({
    label,
    name,
    type = "text",
    value,
  }: {
    label: string;
    name: string;
    type?: string;
    value?: string | number | null;
  }) => (
    <div style={{ flex: "1 1 220px" }}>
      <label>{label}</label>
      <input name={name} type={type} defaultValue={value ?? ""} />
    </div>
  );

  // Dropdown select with a placeholder + options.
  const Sel = ({
    label,
    name,
    value,
    options,
    flex = "1 1 220px",
  }: {
    label: string;
    name: string;
    value?: string | null;
    options: string[];
    flex?: string;
  }) => (
    <div style={{ flex }}>
      <label>{label}</label>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );

  // Multi-select checkbox group; saved comma-separated by the action.
  const Checks = ({
    label,
    name,
    value,
    options,
  }: {
    label: string;
    name: string;
    value?: string | null;
    options: string[];
  }) => {
    const picked = (value ?? "").split(",").map((s) => s.trim());
    return (
      <div style={{ flex: "1 1 280px" }}>
        <label>{label}</label>
        <div className="row">
          {options.map((o) => (
            <label key={o} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                name={name}
                value={o}
                defaultChecked={picked.includes(o)}
                style={{ width: "auto" }}
              />{" "}
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  };

  // Shared field block for one additional secondary/high school (same questions
  // as the main school, plus from/to dates and a reason for leaving).
  type SchoolRow = {
    name?: string | null; notListed?: string | null; type?: string | null;
    country?: string | null; address1?: string | null; address2?: string | null;
    address3?: string | null; city?: string | null; state?: string | null;
    zip?: string | null; fromDate?: Date | null; toDate?: Date | null;
    reasonLeft?: string | null;
  };
  const SchoolFields = ({ v }: { v?: SchoolRow }) => (
    <>
      <div className="row">
        <F label="School name" name="name" value={v?.name} />
        <Sel label="Not in Common App’s list? (enter manually)" name="notListed"
          value={v?.notListed ?? "Yes"} flex="1 1 220px" options={["Yes", "No"]} />
        <Sel label="School type" name="type" value={v?.type} flex="1 1 180px"
          options={["Public", "Charter", "Religious", "Home school", "Independent"]} />
      </div>
      <div className="row">
        <F label="Country/Region/Territory" name="country" value={v?.country} />
        <F label="From date" name="fromDate" type="date" value={isoDate(v?.fromDate ?? null)} />
        <F label="To date" name="toDate" type="date" value={isoDate(v?.toDate ?? null)} />
      </div>
      <div className="row">
        <F label="Address line 1" name="address1" value={v?.address1} />
        <F label="Address line 2" name="address2" value={v?.address2} />
        <F label="Address line 3" name="address3" value={v?.address3} />
      </div>
      <div className="row">
        <F label="City" name="city" value={v?.city} />
        <F label="State/Province (US: combobox)" name="state" value={v?.state} />
        <F label="Zip/Postal code" name="zip" value={v?.zip} />
      </div>
      <div className="row">
        <div style={{ flex: "1 1 100%" }}>
          <label>Why did you leave this school?</label>
          <textarea name="reasonLeft" rows={2} defaultValue={v?.reasonLeft ?? ""} />
        </div>
      </div>
    </>
  );

  // Shared field block for one college/university (manual-entry questions plus
  // course-detail flags, from/to dates, and degree earned).
  type CollegeRow = {
    name?: string | null; notListed?: string | null; country?: string | null;
    address1?: string | null; address2?: string | null; address3?: string | null;
    city?: string | null; state?: string | null; zip?: string | null;
    courseDetails?: string | null; fromDate?: Date | null; toDate?: Date | null;
    degreeEarned?: string | null;
  };
  const COURSE_DETAILS = [
    "Dual enrollment with high school",
    "Summer program",
    "Credit awarded directly by college",
  ];
  const CollegeFields = ({ v }: { v?: CollegeRow }) => {
    const picked = (v?.courseDetails ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    return (
      <>
        <div className="row">
          <F label="College/university name" name="name" value={v?.name} />
          <Sel label="Not in Common App’s list? (enter manually)" name="notListed"
            value={v?.notListed ?? "Yes"} flex="1 1 220px" options={["Yes", "No"]} />
          <Sel label="Degree earned" name="degreeEarned" value={v?.degreeEarned} flex="1 1 160px"
            options={["AA", "AS", "BA", "BS"]} />
        </div>
        <div className="row">
          <F label="Country/Region/Territory" name="country" value={v?.country} />
          <F label="From date" name="fromDate" type="date" value={isoDate(v?.fromDate ?? null)} />
          <F label="To date" name="toDate" type="date" value={isoDate(v?.toDate ?? null)} />
        </div>
        <div className="row">
          <F label="Address line 1" name="address1" value={v?.address1} />
          <F label="Address line 2" name="address2" value={v?.address2} />
          <F label="Address line 3" name="address3" value={v?.address3} />
        </div>
        <div className="row">
          <F label="City" name="city" value={v?.city} />
          <F label="State/Province (US: combobox)" name="state" value={v?.state} />
          <F label="Zip/Postal code" name="zip" value={v?.zip} />
        </div>
        <label>Course details (check all that apply)</label>
        <div className="row">
          {COURSE_DETAILS.map((c) => (
            <label key={c} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="courseDetails" value={c}
                defaultChecked={picked.includes(c)} style={{ width: "auto" }} /> {c}
            </label>
          ))}
        </div>
      </>
    );
  };

  return (
    <main>
      <h1>Your profile</h1>
      <p className="muted">
        This is the single source of truth. Autofill and AI use <em>only</em> what
        you enter here — nothing is invented. Leave fields blank if unknown.
      </p>

      <form action={saveProfileAction}>
        <div className="card">
          <h2>Identity</h2>
          <div className="row">
            <F label="Legal first name" name="legalFirstName" value={p?.legalFirstName} />
            <F label="Middle name" name="middleName" value={p?.middleName} />
            <F label="Legal last name" name="legalLastName" value={p?.legalLastName} />
            <Sel label="Suffix" name="suffix" value={p?.suffix} flex="1 1 140px"
              options={["Jr.", "Sr.", "II", "III", "IV", "V"]} />
          </div>
          <div className="row">
            <Sel label="Share a different first name people call you?" name="sharePreferredName"
              value={p?.sharePreferredName} flex="1 1 280px" options={["Yes", "No"]} />
            <F label="Preferred name (if yes)" name="preferredName" value={p?.preferredName} />
          </div>
          <div className="row">
            <Sel label="Materials under a former legal name?" name="hasFormerName"
              value={p?.hasFormerName} flex="1 1 260px" options={["Yes", "No"]} />
            <F label="Former last name (if yes)" name="formerLastName" value={p?.formerLastName} />
          </div>
          <div className="row">
            <F label="Date of birth" name="dateOfBirth" type="date" value={isoDate(p?.dateOfBirth ?? null)} />
            <F label="City of birth" name="birthCity" value={p?.birthCity} />
            <F label="Birth country/region" name="birthCountry" value={p?.birthCountry} />
            <F label="Citizenship (countries)" name="citizenship" value={p?.citizenship} />
          </div>
          <div className="row">
            <Sel label="Citizenship status" name="citizenshipStatus" value={p?.citizenshipStatus} flex="1 1 320px"
              options={[
                "U.S. citizen or U.S. national",
                "U.S. dual citizen",
                "U.S. permanent resident (green card holder)",
                "U.S. resident",
                "Citizen of non-U.S. country",
              ]} />
            <F label="Years lived in the U.S." name="yearsInUS" value={p?.yearsInUS} />
          </div>
          <div className="row">
            <Sel label="Hold a valid U.S. visa?" name="holdsUSVisa" value={p?.holdsUSVisa} flex="1 1 180px" options={["Yes", "No"]} />
            <Sel label="Intend to apply for a U.S. visa?" name="intendsUSVisa" value={p?.intendsUSVisa} flex="1 1 220px" options={["Yes", "No"]} />
            <F label="Visa type (e.g. F-1 Student)" name="visaType" value={p?.visaType} />
          </div>
        </div>

        <div className="card">
          <h2>Demographics</h2>
          <p className="muted" style={{ marginTop: 0 }}>Optional. Used only if you provide it.</p>
          <div className="row">
            <Checks label="Gender" name="gender" value={p?.gender}
              options={["Female", "Male", "Nonbinary"]} />
            <Sel label="Legal sex" name="legalSex" value={p?.legalSex} flex="1 1 220px"
              options={["Female", "Male", "X or another legal sex"]} />
          </div>
          <div className="row">
            <Checks label="Pronouns" name="pronouns" value={p?.pronouns}
              options={["He/Him", "She/Her", "They/Them"]} />
          </div>
        </div>

        <div className="card">
          <h2>Contact &amp; phone</h2>
          <div className="row">
            <F label="Email" name="email" type="email" value={p?.email} />
          </div>
          <div className="row">
            <Sel label="Preferred phone type" name="phoneType" value={p?.phoneType} flex="1 1 160px"
              options={["Home", "Mobile"]} />
            <F label="Country code (e.g. +7)" name="phoneCountryCode" value={p?.phoneCountryCode} />
            <F label="Phone number" name="phone" type="tel" value={p?.phone} />
          </div>
          <div className="row">
            <Sel label="Alternate phone" name="alternatePhone" value={p?.alternatePhone} flex="1 1 200px"
              options={["No other telephone", "Home", "Mobile"]} />
            <F label="Alternate country code (if any)" name="alternatePhoneCountryCode" value={p?.alternatePhoneCountryCode} />
            <F label="Alternate phone number (if any)" name="alternatePhoneNumber" value={p?.alternatePhoneNumber} />
          </div>
        </div>

        <div className="card">
          <h2>Address</h2>
          <div className="row">
            <F label="Address line 1" name="addressLine1" value={p?.addressLine1} />
            <F label="Address line 2" name="addressLine2" value={p?.addressLine2} />
          </div>
          <div className="row">
            <F label="City" name="city" value={p?.city} />
            <F label="State/Region" name="state" value={p?.state} />
            <F label="Postal code" name="postalCode" value={p?.postalCode} />
            <F label="Country" name="country" value={p?.country} />
          </div>
        </div>

        <div className="card">
          <h2>Education</h2>
          <div className="row">
            <F label="High school" name="highSchoolName" value={p?.highSchoolName} />
            <F label="Date of entry" name="dateOfEntry" type="date" value={isoDate(p?.dateOfEntry ?? null)} />
            <F label="Graduation date" name="graduationDate" type="date" value={isoDate(p?.graduationDate ?? null)} />
            <F label="Graduation year" name="graduationYear" type="number" value={p?.graduationYear} />
          </div>
          <div className="row">
            <F label="GPA" name="gpa" type="number" value={p?.gpa} />
            <F label="GPA scale" name="gpaScale" type="number" value={p?.gpaScale} />
            <F label="Graduating class size" name="classSize" type="number" value={p?.classSize} />
          </div>
          <div className="row">
            <F label="SAT total" name="satTotal" type="number" value={p?.satTotal} />
            <F label="ACT composite" name="actComposite" type="number" value={p?.actComposite} />
            <F label="Intended major" name="intendedMajor" value={p?.intendedMajor} />
          </div>

          <h3 style={{ marginBottom: 4 }}>Secondary/high school details</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Most non-US schools aren’t in Common App’s lookup. Leave “Not in
            Common App’s list” as <strong>Yes</strong> and fill the details
            below — the extension selects “I don’t see my high school in this
            list” and enters them for you.
          </p>
          <div className="row">
            <Sel label="Not in Common App’s list? (enter manually)" name="highSchoolNotListed"
              value={p?.highSchoolNotListed ?? "Yes"} flex="1 1 240px" options={["Yes", "No"]} />
            <Sel label="School type" name="highSchoolType" value={p?.highSchoolType} flex="1 1 200px"
              options={["Public", "Charter", "Religious", "Home school", "Independent"]} />
            <F label="Country/Region/Territory" name="highSchoolCountry" value={p?.highSchoolCountry} />
          </div>
          <div className="row">
            <F label="Address line 1" name="highSchoolAddress1" value={p?.highSchoolAddress1} />
            <F label="Address line 2" name="highSchoolAddress2" value={p?.highSchoolAddress2} />
            <F label="Address line 3" name="highSchoolAddress3" value={p?.highSchoolAddress3} />
          </div>
          <div className="row">
            <F label="City" name="highSchoolCity" value={p?.highSchoolCity} />
            <F label="State/Province (US: combobox)" name="highSchoolState" value={p?.highSchoolState} />
            <F label="Zip/Postal code" name="highSchoolZip" value={p?.highSchoolZip} />
          </div>
          <div className="row">
            <Sel label="Is this a boarding school?" name="isBoardingSchool" value={p?.isBoardingSchool}
              flex="1 1 200px" options={["Yes", "No"]} />
            <Sel label="Did/will you graduate from this school?" name="didGraduate" value={p?.didGraduate}
              flex="1 1 240px" options={["Yes", "No"]} />
          </div>
          <div className="row">
            <Checks label="Progression (check all that apply)" name="progression" value={p?.progression}
              options={[
                "Did or will graduate early",
                "Did or will graduate late",
                "Did or will take time off",
                "Did or will take gap year",
                "No change in progression",
              ]} />
          </div>
        </div>

        <div className="card">
          <h2>Class rank &amp; weighting</h2>
          <div className="row">
            <div style={{ flex: "1 1 180px" }}>
              <label>Class rank reporting</label>
              <select name="classRankReporting" defaultValue={p?.classRankReporting ?? ""}>
                <option value="">—</option>
                <option>Exact</option>
                <option>Decile</option>
                <option>Quintile</option>
                <option>Quartile</option>
                <option>None</option>
              </select>
            </div>
            <F label="Exact rank (if Exact)" name="classRank" value={p?.classRank} />
            <F label="Decile rank (if Decile)" name="decileRank" value={p?.decileRank} />
            <Sel label="Quintile (if Quintile)" name="quintileRank" value={p?.quintileRank} flex="1 1 160px"
              options={["Top 20%", "Top 40%", "Top 60%", "Top 80%", "Top 100%"]} />
            <Sel label="Quartile (if Quartile)" name="quartileRank" value={p?.quartileRank} flex="1 1 160px"
              options={["Top 25%", "Top 50%", "Top 75%", "Top 100%"]} />
            <div style={{ flex: "1 1 160px" }}>
              <label>Class rank weighting</label>
              <select name="rankWeighting" defaultValue={p?.rankWeighting ?? ""}>
                <option value="">—</option>
                <option>Weighted</option>
                <option>Unweighted</option>
              </select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label>GPA weighting</label>
              <select name="gpaWeighting" defaultValue={p?.gpaWeighting ?? ""}>
                <option value="">—</option>
                <option>Weighted</option>
                <option>Unweighted</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>College plans</h2>
          <div className="row">
            <Sel label="Which best describes you?" name="enrollmentPlan" value={p?.enrollmentPlan}
              flex="1 1 100%" options={ENROLLMENT_PLANS} />
          </div>
          <div className="row">
            <Sel label="Highest degree you intend to earn" name="highestDegree"
              value={p?.highestDegree} flex="1 1 280px" options={DEGREES} />
            <Sel label="Career interest" name="careerInterest"
              value={p?.careerInterest} flex="1 1 280px" options={CAREERS} />
          </div>
        </div>

        <div className="card">
          <h2>Fee waiver</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Only answer “Yes” if you genuinely meet a Common App fee-waiver
            criterion — it’s a certification your counselor may verify.
          </p>
          <div className="row">
            <Sel label="Meet a fee-waiver eligibility criterion?" name="feeWaiverEligible"
              value={p?.feeWaiverEligible} flex="1 1 260px" options={["Yes", "No"]} />
            <F label="Fee waiver signature (your name)" name="feeWaiverSignature" value={p?.feeWaiverSignature} />
            <Sel label="Connect with a UStrive mentor?" name="ustriveMentor"
              value={p?.ustriveMentor} flex="1 1 220px" options={["Yes", "No"]} />
          </div>
        </div>

        <button className="primary" type="submit">Save profile</button>
      </form>

      <div className="card">
        <h2>Languages</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Languages you’re proficient in (up to 5). The extension sets the count
          and fills each language + proficiency on Common App.
        </p>
        {languages.map((l) => (
          <div className="row" key={l.id} style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{l.name}</strong>
              {l.proficiency ? <span className="muted"> — {l.proficiency}</span> : null}
            </span>
            <form action={deleteLanguageAction}>
              <input type="hidden" name="languageId" value={l.id} />
              <button style={{ marginTop: 0 }}>Delete</button>
            </form>
          </div>
        ))}
        {languages.length === 0 && <p className="muted">No languages added.</p>}

        {languages.length < 5 && (
          <form action={addLanguageAction} style={{ marginTop: 12 }}>
            <div className="row">
              <div style={{ flex: "1 1 240px" }}>
                <label>Language</label>
                <input name="name" placeholder="e.g. Kazakh" required />
              </div>
            </div>
            <label>Proficiency</label>
            <div className="row">
              {PROFICIENCY.map((pr) => (
                <label key={pr} style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" name="proficiency" value={pr} style={{ width: "auto" }} /> {pr}
                </label>
              ))}
            </div>
            <button type="submit">Add language</button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Other secondary/high schools</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Any <strong>additional</strong> schools you attended besides the main
          one above (up to 3). The extension sets the school count on Common App
          and fills each one — including the manual “I don’t see my high school”
          entry, the from/to dates, and your reason for leaving.
        </p>

        {otherSchools.map((sch, i) => (
          <div key={sch.id} className="card" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>School {i + 2}{sch.name ? ` — ${sch.name}` : ""}</strong>
              <form action={deleteOtherSchoolAction}>
                <input type="hidden" name="schoolId" value={sch.id} />
                <button style={{ marginTop: 0 }}>Delete</button>
              </form>
            </div>
            <form action={updateOtherSchoolAction}>
              <input type="hidden" name="schoolId" value={sch.id} />
              <SchoolFields v={sch} />
              <button type="submit">Save school {i + 2}</button>
            </form>
          </div>
        ))}
        {otherSchools.length === 0 && <p className="muted">No additional schools added.</p>}

        {otherSchools.length < 3 && (
          <form action={addOtherSchoolAction} style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 4 }}>Add a school</h3>
            <SchoolFields />
            <button type="submit">Add school</button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Colleges &amp; universities</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          If you’ve ever taken coursework at a college or university (dual
          enrollment, summer programs, etc.), add each one (up to 3). The
          extension sets the college count on Common App and fills each one —
          including the manual “I don’t see the college” entry when it isn’t in
          their list, the course-detail flags, dates, and degree earned.
        </p>

        {colleges.map((col, i) => (
          <div key={col.id} className="card" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>College {i + 1}{col.name ? ` — ${col.name}` : ""}</strong>
              <form action={deleteCollegeAction}>
                <input type="hidden" name="collegeId" value={col.id} />
                <button style={{ marginTop: 0 }}>Delete</button>
              </form>
            </div>
            <form action={updateCollegeAction}>
              <input type="hidden" name="collegeId" value={col.id} />
              <CollegeFields v={col} />
              <button type="submit">Save college {i + 1}</button>
            </form>
          </div>
        ))}
        {colleges.length === 0 && <p className="muted">No colleges added.</p>}

        {colleges.length < 3 && (
          <form action={addCollegeAction} style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 4 }}>Add a college</h3>
            <CollegeFields />
            <button type="submit">Add college</button>
          </form>
        )}
      </div>
    </main>
  );
}
