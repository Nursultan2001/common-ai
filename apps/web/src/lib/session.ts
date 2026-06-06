import { SignJWT, jwtVerify } from "jose";

// Signed session tokens (JWT, HS256). The SAME token works two ways:
//  - set as an HttpOnly cookie for the web app
//  - copied into the browser extension as a bearer token
// Both are verified by verifySessionToken().

const COOKIE_NAME = "ua_session";
const ISSUER = "united-agents";
// Long-lived so the extension token stays valid through an application season.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

export interface SessionClaims {
  sub: string; // user id
  role: string; // STUDENT | COUNSELOR | ADMIN
  orgId: string | null;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, orgId: claims.orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: (payload.role as SessionClaims["role"]) ?? "STUDENT",
      orgId: (payload.orgId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
