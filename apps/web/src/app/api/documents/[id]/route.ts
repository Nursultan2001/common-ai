import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSessionUser, canAccessApplicant } from "@/lib/auth";
import { decryptBytes } from "@/lib/crypto";
import { getObject } from "@/lib/storage";

// Owner-only download. Decrypts on the fly; bytes are never stored in the clear.
// GET /api/documents/:id
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await resolveSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const doc = await db.document.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessApplicant(user, doc.applicantId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ciphertext = await getObject(doc.storageKey);
  const plain = decryptBytes(ciphertext, doc.iv, doc.authTag);

  // Wrap in a fresh Uint8Array so the body is a valid BodyInit.
  return new NextResponse(new Uint8Array(plain), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Content-Length": String(plain.length),
      "Cache-Control": "private, no-store",
    },
  });
}
