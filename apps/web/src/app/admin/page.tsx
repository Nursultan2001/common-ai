import { db } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { requireAdmin } from "@/lib/server-auth";
import { bulkInviteAction } from "@/lib/actions/waitlist";
import {
  setUserRoleAction, setUserOrgAction, createOrgAction, toggleOrgActiveAction,
} from "@/lib/actions/admin";

const ROLE_LABEL: Record<string, string> = {
  STUDENT: "Individual", COUNSELOR: "Agency", ADMIN: "Admin",
};

// Admin dashboard. Server component — reads live data. ADMIN-only.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();

  const [
    userCount,
    applicantCount,
    orgCount,
    paidEntitlements,
    revenueAgg,
    recentEvents,
    orgs,
    waitlistCount,
    pendingCount,
    waitlist,
  ] = await Promise.all([
    db.user.count(),
    db.applicant.count(),
    db.org.count(),
    db.entitlement.count({ where: { status: "PAID" } }),
    db.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: "SUCCEEDED" },
    }),
    db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.org.findMany({
      include: { _count: { select: { applicants: true, users: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.waitlistEntry.count(),
    db.waitlistEntry.count({ where: { invited: false } }),
    db.waitlistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { org: { select: { name: true } }, _count: { select: { ownedApplicants: true } } },
  });

  const revenue = revenueAgg._sum.amountCents ?? 0;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  // ---- Autofill health / drift detection (last 30 days) ----
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fillGrouped = await db.fillEvent.groupBy({
    by: ["source", "pageName", "status"],
    _count: { _all: true },
    where: { createdAt: { gte: since } },
  });
  type FieldStat = { source: string; page: string | null; total: number; ok: number; statuses: Record<string, number> };
  const bySource = new Map<string, FieldStat>();
  let fillTotal = 0;
  let fillOk = 0;
  for (const g of fillGrouped) {
    const key = `${g.source}||${g.pageName ?? ""}`;
    const e = bySource.get(key) ?? { source: g.source, page: g.pageName, total: 0, ok: 0, statuses: {} };
    const n = g._count._all;
    const isOk = /^filled/.test(g.status);
    e.total += n;
    if (isOk) e.ok += n;
    e.statuses[g.status] = (e.statuses[g.status] ?? 0) + n;
    bySource.set(key, e);
    fillTotal += n;
    if (isOk) fillOk += n;
  }
  const topFail = (s: FieldStat) =>
    Object.entries(s.statuses)
      .filter(([st]) => !/^filled/.test(st))
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  // A field is "drifting" if attempted enough and failing ≥20% of the time.
  const drift = [...bySource.values()]
    .filter((s) => s.total >= 3 && s.ok / s.total < 0.8)
    .sort((a, b) => a.ok / a.total - b.ok / b.total);
  const fillRate = fillTotal ? Math.round((fillOk / fillTotal) * 100) : null;

  return (
    <main>
      <h1>Admin dashboard</h1>

      <div className="grid">
        <div className="card">
          <div className="muted">Revenue</div>
          <div className="kpi">{formatUsd(revenue)}</div>
        </div>
        <div className="card">
          <div className="muted">Applications unlocked</div>
          <div className="kpi">{paidEntitlements}</div>
        </div>
        <div className="card">
          <div className="muted">Applicants</div>
          <div className="kpi">{applicantCount}</div>
        </div>
        <div className="card">
          <div className="muted">Users</div>
          <div className="kpi">{userCount}</div>
        </div>
        <div className="card">
          <div className="muted">Waitlist</div>
          <div className="kpi">{waitlistCount}</div>
        </div>
        <div className="card">
          <div className="muted">Agencies / orgs</div>
          <div className="kpi">{orgCount}</div>
        </div>
        <div className="card">
          <div className="muted">Autofill fill-rate (30d)</div>
          <div className="kpi" style={{ color: fillRate === null ? undefined : fillRate >= 90 ? "#5ee6a8" : fillRate >= 75 ? "#ffcf6b" : "#ff8a9b" }}>
            {fillRate === null ? "—" : `${fillRate}%`}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{fillTotal} field attempts</span>
        </div>
      </div>

      <div className="card">
        <h2>Autofill health — drift detection (last 30 days)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Fields whose success rate dropped below 80% across real autofill runs —
          the earliest signal that Common App changed its DOM and a selector needs
          re-harvesting. Only fields attempted ≥3 times are shown.
        </p>
        {fillTotal === 0 ? (
          <p className="muted">No autofill telemetry yet. Run the extension on a Common App page to populate this.</p>
        ) : drift.length === 0 ? (
          <p className="badge paid" style={{ display: "inline-block" }}>✓ All mapped fields healthy (≥80% fill rate)</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Field (source)</th>
                <th>Page</th>
                <th>Fill rate</th>
                <th>Attempts</th>
                <th>Top failure</th>
              </tr>
            </thead>
            <tbody>
              {drift.map((s) => {
                const rate = Math.round((s.ok / s.total) * 100);
                return (
                  <tr key={`${s.source}||${s.page ?? ""}`}>
                    <td><code className="token" style={{ maxWidth: 260 }}>{s.source}</code></td>
                    <td className="muted">{s.page ?? "—"}</td>
                    <td style={{ color: rate >= 50 ? "#ffcf6b" : "#ff8a9b", fontWeight: 700 }}>{rate}%</td>
                    <td className="muted">{s.total}</td>
                    <td className="muted">{topFail(s)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Users &amp; access</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Set each person’s role — <strong>Individual</strong> fills their own
          application; <strong>Agency</strong> manages clients; <strong>Admin</strong>
          controls everything. Assign agency staff to an org.
        </p>
        <table>
          <thead>
            <tr><th>Email</th><th>Role</th><th>Agency / org</th><th>Owns</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}<div className="muted" style={{ fontSize: 11 }}>{u.name ?? ""}</div></td>
                <td>
                  <form action={setUserRoleAction} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} style={{ width: "auto" }}>
                      {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <button style={{ marginTop: 0 }}>Set</button>
                  </form>
                </td>
                <td>
                  <form action={setUserOrgAction} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="orgId" defaultValue={u.orgId ?? ""} style={{ width: "auto" }}>
                      <option value="">— none —</option>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <button style={{ marginTop: 0 }}>Save</button>
                  </form>
                </td>
                <td className="muted">{u._count.ownedApplicants}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Agencies</h2>
        <form action={createOrgAction} className="row" style={{ alignItems: "flex-end", gap: 8 }}>
          <div style={{ flex: "1 1 220px" }}>
            <label>New agency name</label>
            <input name="name" placeholder="e.g. Bright Futures Consulting" required />
          </div>
          <div style={{ flex: "0 0 130px" }}>
            <label>Type</label>
            <select name="type" defaultValue="AGENCY"><option>AGENCY</option><option>SCHOOL</option></select>
          </div>
          <div style={{ flex: "0 0 130px" }}>
            <label>Discount %</label>
            <input name="discountPct" type="number" min={0} max={100} defaultValue={0} />
          </div>
          <button className="primary" style={{ marginTop: 0 }}>Create</button>
        </form>
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Discount</th><th>Staff</th><th>Clients</th><th>Access</th></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{o.type}</td>
                <td>{(o.discountBps / 100).toFixed(0)}%</td>
                <td>{o._count.users}</td>
                <td>{o._count.applicants}</td>
                <td>
                  <form action={toggleOrgActiveAction}>
                    <input type="hidden" name="orgId" value={o.id} />
                    <button style={{ marginTop: 0 }} className={o.active ? "" : "primary"}>
                      {o.active ? "Active — revoke" : "Disabled — grant"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr><td colSpan={6} className="muted">No agencies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Waitlist ({waitlistCount})</h2>
        <p className="muted">
          {pendingCount} pending · {waitlistCount - pendingCount} invited. Inviting
          generates a single-use signup link for each person (copy it below; email
          sending is a TODO).
        </p>
        <div className="row">
          <form action={bulkInviteAction}>
            <input type="hidden" name="limit" value="10" />
            <button style={{ marginTop: 0 }} disabled={pendingCount === 0}>
              Invite next 10
            </button>
          </form>
          <form action={bulkInviteAction}>
            <input type="hidden" name="limit" value="50" />
            <button style={{ marginTop: 0 }} disabled={pendingCount === 0}>
              Invite next 50
            </button>
          </form>
          <form action={bulkInviteAction}>
            <input type="hidden" name="limit" value="all" />
            <button className="primary" style={{ marginTop: 0 }} disabled={pendingCount === 0}>
              Invite all pending ({pendingCount})
            </button>
          </form>
        </div>

        <table style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Audience</th>
              <th>Status</th>
              <th>Invite link</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {waitlist.map((w) => (
              <tr key={w.id}>
                <td>{w.email}</td>
                <td className="muted">{w.name ?? "—"}</td>
                <td className="muted">{w.audience}</td>
                <td>
                  {w.invited ? (
                    <span className="badge paid">invited</span>
                  ) : (
                    <span className="badge locked">pending</span>
                  )}
                </td>
                <td className="muted">
                  {w.inviteToken ? (
                    <code className="token" style={{ maxWidth: 280 }}>
                      {appUrl}/signup?token={w.inviteToken}
                    </code>
                  ) : w.invited ? (
                    "used"
                  ) : (
                    "—"
                  )}
                </td>
                <td className="muted">{w.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {waitlist.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No signups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Recent activity (audit log)</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Applicant</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((e) => (
              <tr key={e.id}>
                <td className="muted">{e.createdAt.toISOString().slice(0, 19)}</td>
                <td>{e.action}</td>
                <td className="muted">{e.applicantId ?? "—"}</td>
              </tr>
            ))}
            {recentEvents.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
