"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import { canAccessApplicant } from "@/lib/auth";
import { encryptBytes } from "@/lib/crypto";
import { putObject, deleteObject } from "@/lib/storage";

const ALLOWED_TYPES = [
  "TRANSCRIPT",
  "TEST_SCORE_REPORT",
  "FINANCIAL_AID",
  "PASSPORT_ID",
  "RESUME",
  "PORTFOLIO",
  "OTHER",
] as const;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadDocumentAction(formData: FormData) {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);

  const file = formData.get("file");
  const typeRaw = String(formData.get("type") ?? "OTHER");
  const type = (ALLOWED_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as (typeof ALLOWED_TYPES)[number])
    : "OTHER";

  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_BYTES) return;

  const plain = Buffer.from(await file.arrayBuffer());
  const { ciphertext, iv, authTag } = encryptBytes(plain);

  const storageKey = `${applicant.id}/${randomUUID()}`;
  await putObject(storageKey, ciphertext);

  await db.document.create({
    data: {
      applicantId: applicant.id,
      type,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storageKey,
      iv,
      authTag,
    },
  });

  await db.auditEvent.create({
    data: {
      action: "DOCUMENT_UPLOADED",
      userId: user.id,
      applicantId: applicant.id,
      meta: JSON.stringify({ type, fileName: file.name }),
    },
  });

  revalidatePath("/dashboard/documents");
}

export async function deleteDocumentAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("documentId") ?? "");
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || !(await canAccessApplicant(user, doc.applicantId))) return;

  await deleteObject(doc.storageKey);
  await db.document.delete({ where: { id } });
  revalidatePath("/dashboard/documents");
}
