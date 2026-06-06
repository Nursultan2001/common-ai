import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { polishActivity } from "@/lib/ai";
import { resolveSessionUser, canAccessApplicant } from "@/lib/auth";

const Body = z.object({ activityId: z.string().min(1) });

export async function POST(req: Request) {
  const user = await resolveSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const activity = await db.activity.findUnique({
    where: { id: parsed.data.activityId },
  });
  if (!activity) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessApplicant(user, activity.applicantId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await polishActivity({
    category: activity.category,
    position: activity.position,
    organization: activity.organization,
    rawDescription: activity.rawDescription,
  });

  const updated = await db.activity.update({
    where: { id: activity.id },
    data: { polishedDescription: result.text, status: "DRAFTED" },
  });

  await db.auditEvent.create({
    data: {
      action: "AI_POLISH_ACTIVITY",
      userId: user.id,
      applicantId: activity.applicantId,
      meta: JSON.stringify({ activityId: activity.id, missing: result.missing }),
    },
  });

  // `missing` is surfaced so the UI can ask the student for the gap rather than
  // the AI inventing it.
  return NextResponse.json({
    polishedDescription: updated.polishedDescription,
    status: updated.status,
    missing: result.missing,
  });
}
