import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { saveProfileAction } from "@/lib/actions/profile";

export const dynamic = "force-dynamic";

function isoDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ProfilePage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const p = await db.masterProfile.findUnique({ where: { applicantId: applicant.id } });

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
            <F label="Suffix (Jr., III…)" name="suffix" value={p?.suffix} />
            <F label="Preferred name" name="preferredName" value={p?.preferredName} />
          </div>
          <div className="row">
            <F label="Date of birth" name="dateOfBirth" type="date" value={isoDate(p?.dateOfBirth ?? null)} />
            <F label="City of birth" name="birthCity" value={p?.birthCity} />
            <F label="Birth country/region" name="birthCountry" value={p?.birthCountry} />
            <F label="Citizenship (countries)" name="citizenship" value={p?.citizenship} />
          </div>
          <div className="row">
            <F label="Email" name="email" type="email" value={p?.email} />
            <F label="Phone" name="phone" type="tel" value={p?.phone} />
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
            <F label="Graduation year" name="graduationYear" type="number" value={p?.graduationYear} />
            <F label="GPA" name="gpa" type="number" value={p?.gpa} />
            <F label="GPA scale" name="gpaScale" type="number" value={p?.gpaScale} />
          </div>
          <div className="row">
            <F label="SAT total" name="satTotal" type="number" value={p?.satTotal} />
            <F label="ACT composite" name="actComposite" type="number" value={p?.actComposite} />
            <F label="Intended major" name="intendedMajor" value={p?.intendedMajor} />
          </div>
        </div>

        <button className="primary" type="submit">Save profile</button>
      </form>
    </main>
  );
}
