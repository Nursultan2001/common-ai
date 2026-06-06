import Anthropic from "@anthropic-ai/sdk";

// Central AI content service. Every prompt here is built around two hard rules:
//   1. ONLY use facts the student actually provided. Never invent names, dates,
//      numbers, awards, or outcomes.
//   2. Output is a DRAFT for the student to review/edit and approve. We never
//      pass AI text straight into a submission.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AI_MODEL ?? "claude-opus-4-8";

const ANTI_FABRICATION = `
Hard rules you must never break:
- Use ONLY the facts explicitly provided by the student below. Do not invent or
  embellish names, organizations, dates, hours, numbers, titles, awards, or
  outcomes.
- If a detail is missing, do NOT fill it with a plausible guess. Instead omit it
  and, if it materially weakens the text, list it under MISSING.
- Do not change the meaning of what the student said. Tighten and clarify only.
- Write in a natural, human, first-person voice — never flowery or robotic.
`.trim();

export interface PolishResult {
  text: string;
  missing: string[];
}

/** Parse the model's "TEXT:" / "MISSING:" structured reply. */
function parsePolish(raw: string): PolishResult {
  const missingMatch = raw.match(/MISSING:\s*([\s\S]*)$/i);
  const textMatch = raw.match(/TEXT:\s*([\s\S]*?)(?:\nMISSING:|$)/i);
  const text = (textMatch?.[1] ?? raw).trim();
  const missing = (missingMatch?.[1] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*\d.]+\s*/, "").trim())
    .filter((l) => l.length > 0 && l.toLowerCase() !== "none");
  return { text, missing };
}

async function complete(system: string, user: string): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Polish a Common App activity description. Hard limit: 150 characters. */
export async function polishActivity(input: {
  category?: string | null;
  position?: string | null;
  organization?: string | null;
  rawDescription: string;
}): Promise<PolishResult> {
  const system = `You are an expert college-admissions writing coach helping a
student tighten ONE Common App activity description.
${ANTI_FABRICATION}

Constraints:
- The "TEXT" you output MUST be 150 characters or fewer (Common App limit).
- Lead with action verbs and concrete impact that the student actually stated.

Reply in exactly this format:
TEXT: <the <=150 char description>
MISSING: <bullet list of facts that would strengthen it, or "none">`;

  const user = `Category: ${input.category ?? "(not provided)"}
Role/Position: ${input.position ?? "(not provided)"}
Organization: ${input.organization ?? "(not provided)"}
Student's own words: "${input.rawDescription}"`;

  const result = parsePolish(await complete(system, user));
  // Enforce the limit defensively even if the model overshoots.
  if (result.text.length > 150) result.text = result.text.slice(0, 150).trim();
  return result;
}

/** Polish a Common App honor title. Hard limit: 100 characters. */
export async function polishHonor(input: {
  title: string;
  level?: string | null;
  rawDescription: string;
}): Promise<PolishResult> {
  const system = `You are an expert college-admissions writing coach helping a
student phrase ONE Common App honor/award title clearly.
${ANTI_FABRICATION}

Constraints:
- The "TEXT" you output MUST be 100 characters or fewer (Common App limit).

Reply in exactly this format:
TEXT: <the <=100 char honor title>
MISSING: <bullet list of clarifying facts, or "none">`;

  const user = `Award title (student's words): "${input.title}"
Recognition level: ${input.level ?? "(not provided)"}
Context: "${input.rawDescription}"`;

  const result = parsePolish(await complete(system, user));
  if (result.text.length > 100) result.text = result.text.slice(0, 100).trim();
  return result;
}

/**
 * Essay COACHING. Produces an outline + draft scaffold the student then
 * rewrites in their own voice. This is explicitly a coaching aid, not a
 * ghost-written final submission.
 */
export async function draftEssayScaffold(input: {
  prompt: string;
  wordLimit?: number | null;
  studentNotes: string;
}): Promise<{ outline: string; draft: string; missing: string[] }> {
  const system = `You are a college-essay writing coach. Help the student
develop THEIR story for the prompt below. This is a coaching scaffold the
student will rewrite in their own voice and submit under their own authorship.
${ANTI_FABRICATION}

Produce:
1) A short outline (3-5 beats) grounded in the student's notes.
2) A first-draft scaffold the student can react to and rewrite.
${input.wordLimit ? `Keep the draft under ${input.wordLimit} words.` : ""}

Reply in this format:
OUTLINE:
<outline>
DRAFT:
<draft>
MISSING:
<facts/experiences that would make this stronger, or "none">`;

  const user = `Prompt: ${input.prompt}
Student's notes and real experiences: "${input.studentNotes}"`;

  const raw = await complete(system, user);
  const outline = (raw.match(/OUTLINE:\s*([\s\S]*?)(?:\nDRAFT:|$)/i)?.[1] ?? "").trim();
  const draft = (raw.match(/DRAFT:\s*([\s\S]*?)(?:\nMISSING:|$)/i)?.[1] ?? "").trim();
  const missing = (raw.match(/MISSING:\s*([\s\S]*)$/i)?.[1] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*\d.]+\s*/, "").trim())
    .filter((l) => l.length > 0 && l.toLowerCase() !== "none");
  return { outline, draft, missing };
}
