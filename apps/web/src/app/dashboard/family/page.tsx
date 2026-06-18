import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import {
  saveParentAction,
  saveHouseholdAction,
  addSiblingAction,
  deleteSiblingAction,
} from "@/lib/actions/family";

export const dynamic = "force-dynamic";

type ParentRow = {
  parentType: string | null;
  isLiving: string | null;
  prefix: string | null;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  suffix: string | null;
  formerLastName: string | null;
  email: string | null;
  phoneType: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  occupation: string | null;
  occupationOther: string | null;
  employmentStatus: string | null;
  educationLevel: string | null;
  parentCollegeEmployment: string | null;
  parentInstitutionsAttended: string | null;
  title: string | null;
  employer: string | null;
};

function Sel({
  label, name, value, options, flex = "1 1 160px",
}: { label: string; name: string; value?: string | null; options: string[]; flex?: string }) {
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
function Inp({
  label, name, value, type = "text", flex = "1 1 160px", max,
}: { label: string; name: string; value?: string | null; type?: string; flex?: string; max?: number }) {
  return (
    <div style={{ flex }}>
      <label>{label}</label>
      <input name={name} type={type} maxLength={max} defaultValue={value ?? ""} />
    </div>
  );
}

// Exact Common App parent dropdown options (harvested live, page 5/27).
const EDU = [
  "None",
  "Some grade/primary school",
  "Completed grade/primary school",
  "Some high/secondary school",
  "Graduated from high/secondary school (or equivalent)",
  "Some trade school or community college",
  "Graduated from trade school or community college",
  "Some college/university",
  "Graduated from college/university",
  "Graduate school",
];
const EMPLOYMENT = ["Employed", "Unemployed", "Retired", "Self-Employed"];
// Sibling education detail (college supplements). Education list matches EDU.
const SIBLING_EDU = EDU;
const SIBLING_DEGREE = [
  "Associate's (AA, AS)", "Bachelor's (BA, BS)", "Master's (MA, MS)",
  "Business (MBA, MAcc)", "Law (JD, LLM)", "Medicine (MD, DO, DVM, DDS)",
  "Doctorate (PhD, EdD, etc)", "Other",
];
const OCCUPATIONS = [
  "Accountant or actuary", "Actor or entertainer", "Architect or urban planner", "Artist",
  "Business (clerical)", "Business executive (management, administrator)", "Business owner or proprietor",
  "Business salesperson or buyer", "Clergy (minister, priest)", "Clergy (other religious)",
  "Clinical psychologist", "College administrator/staff", "College teacher",
  "Computer programmer or analyst", "Conservationist or forester", "Dentist (including orthodontist)",
  "Dietitian or nutritionist", "Engineer", "Farmer or rancher",
  "Foreign service worker (including diplomat)", "Homemaker (full-time)",
  "Interior decorator (including designer)", "Lab technician or hygienist", "Laborer",
  "Law enforcement officer", "Lawyer (attorney) or judge", "Military service (career)",
  "Musician (performer, composer)", "Nurse", "Optometrist", "Pharmacist", "Physician",
  "Policymaker/Government", "School counselor", "School principal or superintendent",
  "Scientific researcher", "Skilled trades", "Social, welfare, or recreation worker",
  "Teacher or administrator (elementary)", "Teacher or administrator (secondary)",
  "Therapist (physical, occupational, speech)", "Veterinarian", "Writer or journalist", "Other",
];

function ParentForm({ order, p }: { order: 0 | 1; p?: ParentRow }) {
  return (
    <div className="card">
      <h2>Parent / Guardian {order + 1}</h2>
      <form action={saveParentAction}>
        <input type="hidden" name="order" value={order} />
        <div className="row">
          <Sel label="Parent type" name="parentType" value={p?.parentType} flex="1 1 200px"
            options={["Mother", "Father", "I have limited information about this parent"]} />
          <Sel label="Is this parent living?" name="isLiving" value={p?.isLiving} flex="1 1 150px" options={["Yes", "No"]} />
          <Sel label="Prefix" name="prefix" value={p?.prefix} flex="1 1 120px"
            options={["Mr.", "Mrs.", "Ms.", "Mx.", "Dr.", "Rev."]} />
        </div>
        <div className="row">
          <Inp label="First/given name" name="firstName" value={p?.firstName} />
          <Inp label="Middle initial" name="middleInitial" value={p?.middleInitial} max={2} flex="1 1 80px" />
          <Inp label="Last/family/surname" name="lastName" value={p?.lastName} />
          <Sel label="Suffix" name="suffix" value={p?.suffix} flex="1 1 100px"
            options={["Jr.", "Sr.", "II", "III", "IV", "V"]} />
        </div>
        <div className="row">
          <Inp label="Former last name (if any)" name="formerLastName" value={p?.formerLastName} flex="1 1 200px" />
          <Inp label="Preferred email" name="email" type="email" value={p?.email} flex="1 1 220px" />
        </div>
        <div className="row">
          <Sel label="Preferred phone" name="phoneType" value={p?.phoneType} flex="1 1 140px"
            options={["Mobile", "Home", "Other", "Work"]} />
          <Inp label="Country code (e.g. +7)" name="phoneCountryCode" value={p?.phoneCountryCode} flex="1 1 120px" />
          <Inp label="Phone number" name="phoneNumber" type="tel" value={p?.phoneNumber} />
        </div>
        <div className="row">
          <Sel label="Occupation" name="occupation" value={p?.occupation} flex="1 1 240px" options={OCCUPATIONS} />
          <Inp label="Other occupation details" name="occupationOther" value={p?.occupationOther} flex="1 1 200px" />
          <Sel label="Employment status" name="employmentStatus" value={p?.employmentStatus} flex="1 1 180px" options={EMPLOYMENT} />
          <Sel label="Highest education level" name="educationLevel" value={p?.educationLevel} flex="1 1 220px" options={EDU} />
        </div>
        <div className="row">
          <Inp label="Job title / position (college supplements)" name="title" value={p?.title} flex="1 1 240px" />
          <Inp label="Current employer (college supplements)" name="employer" value={p?.employer} flex="1 1 240px" />
        </div>
        <div className="row">
          <Sel label="Employed by / retired from a college or university?" name="parentCollegeEmployment"
            value={p?.parentCollegeEmployment} flex="1 1 300px"
            options={["Currently employed at a college/university", "Retired from a college/university", "Not employed at a college/university"]} />
          <Sel label="Total number of institutions attended" name="parentInstitutionsAttended"
            value={p?.parentInstitutionsAttended} flex="1 1 200px"
            options={["1", "2", "3", "4", "5"]} />
        </div>
        <button className="primary" type="submit">Save parent {order + 1}</button>
      </form>
    </div>
  );
}

export default async function FamilyPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const [parents, siblings, profile] = await Promise.all([
    db.parent.findMany({ where: { applicantId: applicant.id }, orderBy: { order: "asc" } }),
    db.sibling.findMany({ where: { applicantId: applicant.id }, orderBy: { order: "asc" } }),
    db.masterProfile.findUnique({ where: { applicantId: applicant.id } }),
  ]);
  const p0 = parents.find((p) => p.order === 0);
  const p1 = parents.find((p) => p.order === 1);

  return (
    <main>
      <h1>Family</h1>
      <p className="muted">
        Household, parents/guardians, and siblings — used to fill Common App’s
        Family section. Parents are separate people, kept apart from your profile.
      </p>

      <div className="card">
        <h2>Household</h2>
        <form action={saveHouseholdAction}>
          <div className="row">
            <Sel label="Parents’ marital status (to each other)" name="parentsMaritalStatus"
              value={profile?.parentsMaritalStatus} flex="1 1 240px"
              options={["Married", "Divorced", "Separated", "Widowed", "Never married", "Civil union/Domestic partners", "Other"]} />
            <Sel label="With whom do you make your permanent home?" name="permanentHomeWith"
              value={profile?.permanentHomeWith} flex="1 1 240px"
              options={["Both Parents", "Parent 1", "Parent 2", "Guardian", "Ward of the court/state", "Other"]} />
            <Sel label="Do you have any children?" name="hasChildren" value={profile?.hasChildren}
              flex="1 1 160px" options={["Yes", "No"]} />
          </div>
          <button className="primary" type="submit">Save household</button>
        </form>
      </div>

      <ParentForm order={0} p={p0 ?? undefined} />
      <ParentForm order={1} p={p1 ?? undefined} />

      <div className="card">
        <h2>Siblings</h2>
        {siblings.map((s) => (
          <div className="row" key={s.id} style={{ justifyContent: "space-between" }}>
            <span>
              {[s.firstName, s.lastName].filter(Boolean).join(" ") || "(unnamed)"}
              {s.ageOrGrade ? ` — ${s.ageOrGrade}` : ""}
            </span>
            <form action={deleteSiblingAction}>
              <input type="hidden" name="siblingId" value={s.id} />
              <button style={{ marginTop: 0 }}>Delete</button>
            </form>
          </div>
        ))}
        {siblings.length === 0 && <p className="muted">No siblings added.</p>}

        <form action={addSiblingAction} style={{ marginTop: 12 }}>
          <div className="row">
            <Inp label="First name" name="firstName" />
            <Inp label="Last name" name="lastName" />
            <Inp label="Age / grade (optional)" name="ageOrGrade" flex="1 1 140px" />
          </div>
          <p className="muted" style={{ marginBottom: 4 }}>
            For college supplements that ask about siblings’ education (optional):
          </p>
          <div className="row">
            <Sel label="Education level" name="educationLevel" flex="1 1 240px" options={SIBLING_EDU} />
            <Sel label="Degree earned or expected" name="degreeEarned" flex="1 1 220px" options={SIBLING_DEGREE} />
            <Inp label="College/university name" name="collegeName" flex="1 1 220px" />
          </div>
          <button type="submit">Add sibling</button>
        </form>
      </div>
    </main>
  );
}
