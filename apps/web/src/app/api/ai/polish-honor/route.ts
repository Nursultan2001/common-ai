import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { polishHonor } from "@/lib/ai";
import { resolveSessionUser, canAccessApplicant } from "@/lib/auth";

const Body = z.object({ honorId: z.string().min(1) });

export async function POST(req: Request) {
  const user = await resolveSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const honor = await db.honor.findUnique({ where: { id: parsed.data.honorId } });
  if (!honor) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessApplicant(user, honor.applicantId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await polishHonor({
    title: honor.title,
    level: honor.level,
    rawDescription: honor.rawDescription,
  });

  const updated = await db.honor.update({
    where: { id: honor.id },
    data: { polishedTitle: result.text, status: "DRAFTED" },
  });

  await db.auditEvent.create({
    data: {
      action: "AI_POLISH_HONOR",
      userId: user.id,
      applicantId: honor.applicantId,
      meta: JSON.stringify({ honorId: honor.id, missing: result.missing }),
    },
  });

  return NextResponse.json({
    polishedTitle: updated.polishedTitle,
    status: updated.status,
    missing: result.missing,
  });
}
