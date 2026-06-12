import { requireAdmin } from "@/lib/server-auth";
import { logoutAction } from "@/lib/actions/auth";
import AppBackground from "../AppBackground";
import NavLinks from "../NavLinks";

export const dynamic = "force-dynamic";

// Admin shell — same high-tech treatment as the dashboard.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  return (
    <>
      <AppBackground />
      <nav className="top">
        <strong>Common AI · Admin</strong>
        <NavLinks
          links={[
            { href: "/admin", label: "Dashboard" },
            { href: "/dashboard", label: "My application" },
          ]}
        />
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
        <form action={logoutAction}>
          <button style={{ marginTop: 0 }}>Sign out</button>
        </form>
      </nav>
      {children}
    </>
  );
}
