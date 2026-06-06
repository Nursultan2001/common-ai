"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  setSessionCookie,
  clearSessionCookie,
  getOrCreateApplicantForStudent,
} from "@/lib/server-auth";

const SignupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["STUDENT", "COUNSELOR"]),
  orgName: z.string().optional(),
  token: z.string().min(1, "An invite is required to sign up"),
});

export type ActionState = { error?: string } | undefined;

export async function signupAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    orgName: formData.get("orgName") || undefined,
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const { name, email, password, role, orgName, token } = parsed.data;

  // Waitlist-only: a valid, unconsumed invite token is required.
  const invite = await db.waitlistEntry.findUnique({ where: { inviteToken: token } });
  if (!invite || !invite.invited) {
    return { error: "Invalid or expired invite link." };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with this email already exists." };

  const passwordHash = await bcrypt.hash(password, 12);

  // A counselor who provides an org name creates that agency and owns it.
  let orgId: string | null = null;
  if (role === "COUNSELOR" && orgName) {
    const org = await db.org.create({ data: { name: orgName, type: "AGENCY" } });
    orgId = org.id;
  }

  const user = await db.user.create({
    data: { name, email, passwordHash, role, orgId: orgId ?? undefined },
  });

  if (role === "COUNSELOR" && orgId) {
    await db.membership.create({
      data: { userId: user.id, orgId, role: "COUNSELOR" },
    });
  }
  if (role === "STUDENT") {
    await getOrCreateApplicantForStudent(user.id, user.orgId);
  }

  // Consume the single-use invite token.
  await db.waitlistEntry.update({
    where: { id: invite.id },
    data: { inviteToken: null },
  });

  await setSessionCookie({ sub: user.id, role: user.role, orgId: user.orgId });
  redirect("/dashboard");
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.passwordHash) {
    return { error: "Invalid email or password." };
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return { error: "Invalid email or password." };

  await setSessionCookie({ sub: user.id, role: user.role, orgId: user.orgId });
  redirect("/dashboard");
}

export async function logoutAction() {
  clearSessionCookie();
  redirect("/login");
}
