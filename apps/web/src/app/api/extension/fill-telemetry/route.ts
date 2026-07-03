import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSessionUser, corsHeaders } from "@/lib/auth";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// Receives the extension's per-field fill report for ONE Common App page and
// records it as FillEvent rows. Powers drift detection: when Common App changes
// its DOM, a field's success rate drops and the admin flags it.
//
// Body: {
//   applicationId?: string,
//   fieldMapKey: string,
//   pageName?: string,
//   pageUrl?: string,
//   fields: [{ source: string, status: string, kind?: string }]
// }
//
// Only meaningful outcomes are stored — empty/skipped fields (no value to fill)
// are dropped, so success rate = filled / attempted.
export async function POST(req: Request) {
  const headers = corsHeaders();
  const user = await resolveSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400, headers });
  }

  const b = body as {
    applicationId?: unknown;
    fieldMapKey?: unknown;
    pageName?: unknown;
    pageUrl?: unknown;
    fields?: unknown;
  };
  const fieldMapKey = typeof b.fieldMapKey === "string" ? b.fieldMapKey : null;
  if (!fieldMapKey || !Array.isArray(b.fields)) {
    return NextResponse.json({ error: "fieldMapKey and fields[] required" }, { status: 400, headers });
  }

  const str = (v: unknown, max = 300) =>
    typeof v === "string" ? v.slice(0, max) : null;
  const applicationId = str(b.applicationId, 60);
  const pageName = str(b.pageName, 200);
  const pageUrl = str(b.pageUrl, 400);

  // Keep only outcomes that reflect an actual fill attempt (a value was present).
  const rows = (b.fields as unknown[])
    .slice(0, 600)
    .map((f) => {
      const o = f as { source?: unknown; status?: unknown; kind?: unknown };
      const source = str(o.source, 200);
      const status = str(o.status, 60);
      if (!source || !status) return null;
      if (/^(empty|skip)/.test(status)) return null; // no value to fill → not counted
      return {
        fieldMapKey,
        pageName,
        pageUrl,
        source,
        kind: str(o.kind, 40),
        status,
        ok: /^filled/.test(status),
        userId: user.id,
        applicationId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, stored: 0 }, { headers });
  }

  await db.fillEvent.createMany({ data: rows });
  return NextResponse.json({ ok: true, stored: rows.length }, { headers });
}
