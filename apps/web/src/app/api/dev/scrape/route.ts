import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// DEV-ONLY ingest for the deep scraper. Stores read-only page STRUCTURE (field
// labels/ids/options) — never applicant values. Guarded by a shared token.
// Remove this route + the ScrapeDump model once the field map is built.

const TOKEN = "ca-scrape-9e6913164d85e7d9";
const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || body.token !== TOKEN || typeof body.path !== "string") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: cors });
  }
  await db.scrapeDump.upsert({
    where: { path: body.path },
    update: { data: JSON.stringify(body.data ?? null) },
    create: { path: body.path, data: JSON.stringify(body.data ?? null) },
  });
  return NextResponse.json({ ok: true, path: body.path }, { headers: cors });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (token !== TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: cors });
  }
  const dumps = await db.scrapeDump.findMany({ select: { path: true, updatedAt: true } });
  return NextResponse.json(
    { count: dumps.length, paths: dumps.map((d) => d.path) },
    { headers: cors }
  );
}
