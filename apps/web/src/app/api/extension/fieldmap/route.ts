import { NextResponse } from "next/server";
import { resolveSessionUser, corsHeaders } from "@/lib/auth";
import { getTemplate } from "@united/field-maps";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// Serves a field-map template to the extension. Kept server-side so the mapping
// library (the moat) never ships inside the installable extension.
// GET /api/extension/fieldmap?key=common-app-core
export async function GET(req: Request) {
  const headers = corsHeaders();
  const user = await resolveSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }

  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key required" }, { status: 400, headers });
  }

  const template = getTemplate(key);
  if (!template) {
    return NextResponse.json({ error: "unknown template" }, { status: 404, headers });
  }

  return NextResponse.json(template, { headers });
}
