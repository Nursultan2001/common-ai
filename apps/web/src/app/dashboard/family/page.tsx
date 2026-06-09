import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import {
  saveParentAction,
  addSiblingAction,
  deleteSiblingAction,
} from "@/lib/actions/family";

export const dynamic = "force-dynamic";

type ParentRow = {
  relationship: string | null;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  suffix: string | null;
  formerLastName: string | null;
  email: string | null;
  occupation: string | null;
};

function ParentForm({ order, p }: { order: 0 | 1; p?: ParentRow }) {
  return (
    <div className="card">
      <h2>Parent / Guardian {order + 1}</h2>
      <form action={saveParentAction}>
        <input type="hidden" name="order" value={order} />
        <div className="row">
          <div style={{ flex: "1 1 160px" }}>
            <label>Relationship</label>
            <select name="relationship" defaultValue={p?.relationship ?? ""}>
              <option value="">—</option>
              <option>Mother</option>
              <option>Father</option>
              <option>Guardian</option>
              <option>Other</option>
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label>First/given name</label>
            <input name="firstName" defaultValue={p?.firstName ?? ""} />
          </div>
          <div style={{ flex: "1 1 80px" }}>
            <label>Middle initial</label>
            <input name="middleInitial" maxLength={2} defaultValue={p?.middleInitial ?? ""} />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label>Last/family/surname</label>
            <input name="lastName" defaultValue={p?.lastName ?? ""} />
          </div>
          <div style={{ flex: "1 1 80px" }}>
            <label>Suffix</label>
            <input name="suffix" defaultValue={p?.suffix ?? ""} />
          </div>
        </div>
        <div className="row">
          <div style={{ flex: "1 1 200px" }}>
            <label>Former last name (if any)</label>
            <input name="formerLastName" defaultValue={p?.formerLastName ?? ""} />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <label>Preferred email</label>
            <input name="email" type="email" defaultValue={p?.email ?? ""} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label>Occupation</label>
            <input name="occupation" defaultValue={p?.occupation ?? ""} />
          </div>
        </div>
        <button className="primary" type="submit">Save parent {order + 1}</button>
      </form>
    </div>
  );
}

export default async function FamilyPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const [parents, siblings] = await Promise.all([
    db.parent.findMany({ where: { applicantId: applicant.id }, orderBy: { order: "asc" } }),
    db.sibling.findMany({ where: { applicantId: applicant.id }, orderBy: { order: "asc" } }),
  ]);
  const p0 = parents.find((p) => p.order === 0);
  const p1 = parents.find((p) => p.order === 1);

  return (
    <main>
      <h1>Family</h1>
      <p className="muted">
        Parents/guardians and siblings — these are separate people from you, so
        we keep them apart from your own profile. Used to fill Common App’s Family
        section.
      </p>

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
            <div style={{ flex: "1 1 160px" }}>
              <label>First name</label>
              <input name="firstName" />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label>Last name</label>
              <input name="lastName" />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label>Age / grade (optional)</label>
              <input name="ageOrGrade" />
            </div>
          </div>
          <button type="submit">Add sibling</button>
        </form>
      </div>
    </main>
  );
}
