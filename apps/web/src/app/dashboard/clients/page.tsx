import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server-auth";
import { createClientAction, regenerateClientLinkAction, manageClientAction } from "@/lib/actions/clients";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requireUser();
  if (user.role !== "COUNSELOR" && user.role !== "ADMIN") {
    return (
      <main>
        <h1>Clients</h1>
        <p className="muted">This area is for agency/counselor accounts.</p>
      </main>
    );
  }

  const clients = await db.applicant.findMany({
    where: {
      intakeToken: { not: null },
      OR: [{ orgId: user.orgId ?? "__none__" }, { ownerUserId: user.id }],
    },
    orderBy: { createdAt: "desc" },
    include: { profile: { select: { id: true } } },
  });

  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  const statusOf = (c: (typeof clients)[number]) =>
    c.intakeSubmittedAt ? "Submitted" : c.profile ? "In progress" : "Not started";

  return (
    <main>
      <h1>Clients</h1>
      <p className="muted">
        Create a client, then send them their private link. They fill it out with
        no login; you watch the status here and autofill their Common App when
        they’re done.
      </p>

      <div className="card">
        <h2>New client</h2>
        <form action={createClientAction}>
          <div className="row">
            <div style={{ flex: "1 1 320px" }}>
              <label>Client name (only you see this)</label>
              <input name="clientName" placeholder="e.g. Aizhan N. (2026)" required />
            </div>
          </div>
          <button className="primary" type="submit">Create client &amp; link</button>
        </form>
      </div>

      <div className="card">
        <h2>Your clients</h2>
        {clients.length === 0 && <p className="muted">No clients yet.</p>}
        {clients.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid var(--line, rgba(140,160,210,.16))", padding: "12px 0" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <a href={`/dashboard/clients/${c.id}`} style={{ fontWeight: 700, fontSize: 16 }}>
                {c.intakeClientName || "(unnamed client)"}
              </a>
              <span className={`badge ${c.intakeSubmittedAt ? "paid" : "locked"}`}>{statusOf(c)}</span>
            </div>
            <a href={`/dashboard/clients/${c.id}`} className="muted" style={{ fontSize: 12 }}>View results →</a>
            <label style={{ marginTop: 8 }}>Client fill-out link (share this)</label>
            <input readOnly value={`${origin}/intake/${c.intakeToken}`}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Applicant ID (for the extension): <code>{c.id}</code></span>
              <span className="spacer" />
              <form action={manageClientAction}>
                <input type="hidden" name="applicantId" value={c.id} />
                <button className="primary" style={{ marginTop: 0 }}>Fill out / edit →</button>
              </form>
              <form action={regenerateClientLinkAction}>
                <input type="hidden" name="applicantId" value={c.id} />
                <button style={{ marginTop: 0 }}>Regenerate link</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
