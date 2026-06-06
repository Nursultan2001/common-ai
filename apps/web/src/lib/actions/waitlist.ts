"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/server-auth";

const Schema = z.object({
  email: z.string().email("Please enter a valid email."),
  name: z.string().optional(),
  audience: z.enum(["STUDENT", "COUNSELOR"]).default("STUDENT"),
  note: z.string().max(500).optional(),
});

export type WaitlistState = { ok?: boolean; error?: string } | undefined;

export async function joinWaitlistAction(
  _prev: WaitlistState,
  formData: FormData
): Promise<WaitlistState> {
  const parsed = Schema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    audience: formData.get("audience") || "STUDENT",
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { email, name, audience, note } = parsed.data;
  try {
    await db.waitlistEntry.upsert({
      where: { email: email.toLowerCase() },
      update: { name, audience, note },
      create: {
        email: email.toLowerCase(),
        name,
        audience,
        note,
        source: "landing",
      },
    });
  } catch {
    return { error: "Something went wrong. Please try again." };
  }

  return { ok: true };
}

/**
 * Bulk-invite waitlist entries (admin only). Marks pending entries invited and
 * generates a single-use invite token that unlocks /signup for that email.
 * `limit` controls batch size; "all" invites everyone still pending.
 *
 * Email delivery is a TODO (plug in Resend/SES here). For now the invite links
 * are visible/copyable in the admin table.
 */
export async function bulkInviteAction(formData: FormData) {
  await requireAdmin();

  const limitRaw = String(formData.get("limit") ?? "all");
  const take = limitRaw === "all" ? undefined : Math.max(1, Number(limitRaw) || 0);

  const pending = await db.waitlistEntry.findMany({
    where: { invited: false },
    orderBy: { createdAt: "asc" },
    ...(take ? { take } : {}),
  });

  const now = new Date();
  for (const entry of pending) {
    await db.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        invited: true,
        invitedAt: now,
        inviteToken: entry.inviteToken ?? randomBytes(24).toString("hex"),
      },
    });
    // TODO: send invite email to entry.email with the /signup?token=... link.
  }

  revalidatePath("/admin");
}
