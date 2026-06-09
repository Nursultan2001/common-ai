import Link from "next/link";
import { requireUser } from "@/lib/server-auth";
import { logoutAction } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <>
      <nav className="top">
        <strong>Common AI</strong>
        <Link href="/dashboard">Overview</Link>
        <Link href="/dashboard/profile">Profile</Link>
        <Link href="/dashboard/activities">Activities</Link>
        <Link href="/dashboard/honors">Honors</Link>
        <Link href="/dashboard/family">Family</Link>
        <Link href="/dashboard/documents">Documents</Link>
        {user.role === "ADMIN" && <Link href="/admin">Admin</Link>}
        <span className="spacer" />
        <span className="muted">{user.email}</span>
        <form action={logoutAction}>
          <button style={{ marginTop: 0 }}>Sign out</button>
        </form>
      </nav>
      {children}
    </>
  );
}
