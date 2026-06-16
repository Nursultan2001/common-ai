import { requireUser } from "@/lib/server-auth";
import { logoutAction } from "@/lib/actions/auth";
import AppBackground from "../AppBackground";
import NavLinks from "../NavLinks";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/courses", label: "Courses" },
  { href: "/dashboard/activities", label: "Activities" },
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
  const links =
    user.role === "ADMIN" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;
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
      {children}
    </>
  );
}
