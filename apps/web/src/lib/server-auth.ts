import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import {
  signSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type SessionClaims,
} from "./session";

// Helpers for Server Components and Server Actions (cookie-based).

export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  return db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true, role: true, orgId: true },
  });
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

export function setSessionCookie(claims: SessionClaims) {
  return signSessionToken(claims).then((token) => {
    cookies().set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

/**
 * The extension needs the raw token to use as a bearer credential. We re-mint a
 * token with the user's current claims rather than reading the cookie value, so
 * this is safe to surface in the dashboard UI.
 */
export async function mintExtensionToken(claims: SessionClaims) {
  return signSessionToken(claims);
}

/**
 * A STUDENT owns exactly one applicant profile; create it lazily on first use.
 * COUNSELOR/ADMIN manage applicants explicitly (not auto-created here).
 */
export async function getOrCreateApplicantForStudent(userId: string, orgId: string | null) {
  const existing = await db.applicant.findFirst({ where: { ownerUserId: userId } });
  if (existing) return existing;
  return db.applicant.create({
    data: { ownerUserId: userId, orgId: orgId ?? undefined, profile: { create: {} } },
  });
}
