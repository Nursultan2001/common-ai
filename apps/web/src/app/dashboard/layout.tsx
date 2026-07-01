import { db } from "@/lib/db";
import { requireUser, getActiveClientId } from "@/lib/server-auth";
import { logoutAction } from "@/lib/actions/auth";
import { exitClientAction } from "@/lib/actions/clients";
import AppBackground from "../AppBackground";
import NavLinks from "../NavLinks";

export const dynamic = "force-dynamic";

// The Common App application tabs (a student's own application, or a client's
// when an agency is managing one).
const APP_TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/grades", label: "Courses & grades" },
  { href: "/dashboard/activities", label: "Activities" },
  { href: "/dashboard/writing", label: "Writing" },
  { href: "/dashboard/honors", label: "Honors" },
  { href: "/dashboard/family", label: "Family" },
  { href: "/dashboard/testing", label: "Testing" },
  { href: "/dashboard/documents", label: "Documents" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const isAgency = user.role === "COUNSELOR";

  // Are we currently managing a client? (agencies/admins only)
  let managing: { id: string; name: string } | null = null;
  if (isAgency || isAdmin) {
    const id = getActiveClientId();
    if (id) {
      const a = await db.applicant.findUnique({ where: { id }, select: { id: true, intakeClientName: true, ownerUserId: true, orgId: true } });
      if (a && (isAdmin || a.ownerUserId === user.id || (a.orgId && a.orgId === user.orgId))) {
        managing = { id: a.id, name: a.intakeClientName || "client" };
      }
    }
  }

  // Nav by role:
  //  - STUDENT: their own application tabs.
  //  - COUNSELOR (agency): Clients only — plus the application tabs ONLY while
  //    managing a client (they fill/adjust the client's form, never their own).
  //  - ADMIN: everything.
  const ext = { href: "/dashboard/extension", label: "Extension" };
  let links: { href: string; label: string }[];
  if (isAdmin) {
    links = [{ href: "/dashboard/clients", label: "Clients" }, ...APP_TABS, ext, { href: "/admin", label: "Admin" }];
  } else if (isAgency) {
    links = [{ href: "/dashboard/clients", label: "Clients" }, ...(managing ? APP_TABS : []), ext];
  } else {
    links = [...APP_TABS, ext];
  }

  return (
    <>
      <AppBackground />
      <nav className="top">
        <strong>Common AI</strong>
        <NavLinks links={links} />
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
        <form action={logoutAction}>
          <button style={{ marginTop: 0 }}>Sign out</button>
        </form>
      </nav>

      {managing && (
        <div style={{
          background: "linear-gradient(110deg, rgba(91,140,255,.18), rgba(139,75,255,.14))",
          borderBottom: "1px solid rgba(140,160,210,.2)", padding: "8px 18px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 13 }}>
            ✎ Editing client: <strong>{managing.name}</strong> — every section below saves to this client.
          </span>
          <span style={{ flex: 1 }} />
          <form action={exitClientAction}>
            <button style={{ marginTop: 0, padding: "5px 12px" }}>Exit client</button>
          </form>
        </div>
      )}

      {children}
    </>
  );
}
