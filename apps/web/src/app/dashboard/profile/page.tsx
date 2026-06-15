import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { saveProfileAction } from "@/lib/actions/profile";
import { addLanguageAction, deleteLanguageAction } from "@/lib/actions/languages";

export const dynamic = "force-dynamic";

const PROFICIENCY = ["First Language", "Speak", "Read", "Write", "Spoken at Home"];

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
            <F label="Decile rank (if Decile)" name="decileRank" value={p?.decileRank} />
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
            <F label="Highest degree you intend to earn" name="highestDegree" value={p?.highestDegree} />
            <F label="Career interest" name="careerInterest" value={p?.careerInterest} />
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
    </main>
  );
}
