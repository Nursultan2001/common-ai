import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser,
  getOrCreateApplicantForStudent,
  mintExtensionToken, getActiveApplicant, getActiveClientId } from "@/lib/server-auth";
import { formatUsd, quotePrice } from "@/lib/pricing";
import { resolveDiscountBps } from "@/lib/entitlements";
import {
  addApplicationAction,
  startCheckoutAction,
  devUnlockAction,
} from "@/lib/actions/applications";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const user = await requireUser();
  // Agencies don't have a personal application — send them to their client list
  // unless they're actively managing a client.
  if (user.role === "COUNSELOR" && !getActiveClientId()) redirect("/dashboard/clients");
  const applicant = await getActiveApplicant();

  const [profile, activities, honors, docs, applications, universities, discountBps] =
    await Promise.all([
      db.masterProfile.findUnique({ where: { applicantId: applicant.id } }),
      db.activity.count({ where: { applicantId: applicant.id } }),
      db.honor.count({ where: { applicantId: applicant.id } }),
      db.document.count({ where: { applicantId: applicant.id } }),
      db.application.findMany({
        where: { applicantId: applicant.id },
        include: { university: true, entitlement: true },
        orderBy: { createdAt: "desc" },
      }),
      db.university.findMany({ orderBy: { name: "asc" } }),
      resolveDiscountBps(applicant.id),
    ]);

  const quote = quotePrice(discountBps);
  const extToken = await mintExtensionToken({
    sub: user.id,
    role: user.role,
    orgId: user.orgId,
  });
  const profileComplete = Boolean(profile?.legalFirstName && profile?.legalLastName);

  return (
    <main>
      <h1>Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
      <p className="muted">
        Price per application:{" "}
        <strong>{formatUsd(quote.priceCents)}</strong>
        {quote.discountBps > 0 && (
          <> (agency discount {quote.discountBps / 100}% applied)</>
        )}
      </p>

      <div className="grid">
        <div className="card">
          <div className="muted">Profile</div>
          <div className="kpi">{profileComplete ? "✓" : "…"}</div>
          <a href="/dashboard/profile">Edit profile</a>
        </div>
        <div className="card">
          <div className="muted">Activities</div>
          <div className="kpi">{activities}</div>
          <a href="/dashboard/activities">Manage</a>
        </div>
        <div className="card">
          <div className="muted">Honors</div>
          <div className="kpi">{honors}</div>
          <a href="/dashboard/honors">Manage</a>
        </div>
        <div className="card">
          <div className="muted">Documents</div>
          <div className="kpi">{docs}</div>
          <a href="/dashboard/documents">Vault</a>
        </div>
      </div>

      <div className="card">
        <h2>Your applications</h2>
        <table>
          <thead>
            <tr>
              <th>University</th>
              <th>Portal</th>
              <th>Status</th>
              <th>Autofill</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => {
              const paid = a.entitlement?.status === "PAID";
              return (
                <tr key={a.id}>
                  <td>{a.university.name}</td>
                  <td className="muted">{a.university.portalType}</td>
                  <td>{a.status}</td>
                  <td>
                    {paid ? (
                      <span className="badge paid">unlocked</span>
                    ) : (
                      <span className="badge locked">locked</span>
                    )}
                  </td>
                  <td>
                    <div className="row">
                      <code className="token" style={{ maxWidth: 160 }}>
                        {a.id}
                      </code>
                      {!paid && (
                        <form action={startCheckoutAction}>
                          <input type="hidden" name="applicationId" value={a.id} />
                          <button className="primary" style={{ marginTop: 0 }}>
                            Unlock {formatUsd(quote.priceCents)}
                          </button>
                        </form>
                      )}
                      {!paid && process.env.NODE_ENV !== "production" && (
                        <form action={devUnlockAction}>
                          <input type="hidden" name="applicationId" value={a.id} />
                          <button style={{ marginTop: 0 }} title="Local testing only">
                            Dev unlock
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {applications.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No applications yet — add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <form action={addApplicationAction} className="row" style={{ marginTop: 16 }}>
          <select name="universityId" required style={{ maxWidth: 320 }}>
            <option value="">Add a university…</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button style={{ marginTop: 0 }}>Add</button>
        </form>
      </div>

      <div className="card">
        <h2>Browser extension</h2>
        <p className="muted">
          Paste this into the extension popup (Backend URL ={" "}
          <code>{process.env.APP_URL ?? "http://localhost:3000"}</code>), along
          with an Application ID from the table above.
        </p>
        <label>Your access token</label>
        <code className="token">{extToken}</code>
        <p className="muted">
          Autofill only works for applications you’ve unlocked. You review every
          field and submit yourself.
        </p>
      </div>
    </main>
  );
}
