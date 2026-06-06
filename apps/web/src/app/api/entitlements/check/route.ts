import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSessionUser, canAccessApplicant, corsHeaders } from "@/lib/auth";
import { isApplicationUnlocked } from "@/lib/entitlements";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// The extension calls this before unlocking autofill for an application.
// GET /api/entitlements/check?applicationId=...
export async function GET(req: Request) {
  const headers = corsHeaders();
  const user = await resolveSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }

  const applicationId = new URL(req.url).searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json(
      { error: "applicationId required" },
      { status: 400, headers }
    );
  }

  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { applicantId: true },
  });
  if (!app) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers });
  }
  if (!(await canAccessApplicant(user, app.applicantId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  const unlocked = await isApplicationUnlocked(applicationId);
  return NextResponse.json({ unlocked }, { headers });
}
