import { db } from "@/lib/db";

// Resolve the applicant behind a public intake token. The token is the only
// credential for the no-login client form, so every intake action goes through
// here — it scopes all reads/writes to exactly one applicant.
export async function applicantIdFromToken(token: string): Promise<string | null> {
  if (!token) return null;
  const a = await db.applicant.findUnique({
    where: { intakeToken: token },
    select: { id: true },
  });
  return a?.id ?? null;
}

// Shared FormData parsers (mirror the dashboard actions).
export function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}
export function num(fd: FormData, k: string): number | null {
  const s = str(fd, k);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function dateOf(fd: FormData, k: string): Date | null {
  const s = str(fd, k);
  return s ? new Date(s) : null;
}
export function multi(fd: FormData, k: string): string | null {
  const vals = fd.getAll(k).map((v) => String(v).trim()).filter(Boolean);
  return vals.length ? vals.join(", ") : null;
}

// The wizard steps, in order. Writing/essay, college supplements, grades and
// courses are intentionally excluded from the client form.
export const INTAKE_STEPS = [
  { key: "personal", label: "Personal" },
  { key: "contact", label: "Contact & address" },
  { key: "citizenship", label: "Citizenship" },
  { key: "languages", label: "Languages" },
  { key: "family", label: "Family" },
  { key: "education", label: "Education" },
  { key: "testing", label: "Testing" },
  { key: "activities", label: "Activities" },
  { key: "honors", label: "Honors" },
  { key: "writing", label: "Writing" },
  { key: "review", label: "Review & submit" },
] as const;
