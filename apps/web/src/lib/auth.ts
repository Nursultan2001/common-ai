import { db } from "./db";
import { verifySessionToken, SESSION_COOKIE } from "./session";

// --- Auth boundary ---
// A request is authenticated by a signed session JWT, supplied either as:
//   - `Authorization: Bearer <token>`  (browser extension), or
//   - the `ua_session` HttpOnly cookie (web app).
// We verify the signature, then re-load the user from the DB so role/org are
// always fresh (a revoked or downgraded user can't act on a stale token claim).

export type Role = "STUDENT" | "COUNSELOR" | "ADMIN";

export interface SessionUser {
  id: string;
  // String at the DB layer (SQLite has no enums); one of Role's values.
  role: string;
  orgId: string | null;
}

function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  const cookie = req.headers.get("cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
    }
  }
  return null;
}

export async function resolveSessionUser(
  req: Request
): Promise<SessionUser | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, role: true, orgId: true },
  });
  return user;
}

/**
 * Authorize that a session user may act on a given applicant:
 *  - the owner, or
 *  - a counselor/owner in the applicant's org, or
 *  - an admin.
 */
export async function canAccessApplicant(
  user: SessionUser,
  applicantId: string
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const applicant = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { ownerUserId: true, orgId: true },
  });
  if (!applicant) return false;
  if (applicant.ownerUserId === user.id) return true;
  if (applicant.orgId && applicant.orgId === user.orgId) return true;
  return false;
}

// CORS headers so the browser extension can call these endpoints.
export function corsHeaders(): Record<string, string> {
  const origin = process.env.ALLOWED_EXTENSION_ORIGIN ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
  };
}
