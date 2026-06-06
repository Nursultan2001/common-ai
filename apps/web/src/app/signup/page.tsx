import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

// Waitlist-only: signup is reachable ONLY via a valid invite link
// (/signup?token=...). Anyone else is sent back to the waitlist.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;
  if (!token) redirect("/");

  const invite = await db.waitlistEntry.findUnique({
    where: { inviteToken: token },
  });
  if (!invite || !invite.invited) redirect("/");

  return <SignupForm token={token} defaultEmail={invite.email} />;
}
