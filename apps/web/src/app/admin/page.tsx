import { db } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { requireAdmin } from "@/lib/server-auth";
import { bulkInviteAction } from "@/lib/actions/waitlist";

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
      include: { _count: { select: { applicants: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.waitlistEntry.count(),
    db.waitlistEntry.count({ where: { invited: false } }),
    db.waitlistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const revenue = revenueAgg._sum.amountCents ?? 0;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

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
      </div>

      <div className="card">
        <h2>Agencies</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Discount</th>
              <th>Applicants</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{o.type}</td>
                <td>{(o.discountBps / 100).toFixed(0)}%</td>
                <td>{o._count.applicants}</td>
                <td>{o.active ? "yes" : "no"}</td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No agencies yet.
                </td>
              </tr>
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
