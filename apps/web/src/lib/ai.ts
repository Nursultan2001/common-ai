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

async function complete(system: string, user: string, maxTokens = 1024): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
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

// What a strong US college personal statement does — the "training" the essay
// coach applies. Distilled from how admissions readers actually evaluate essays.
const ESSAY_CRAFT = `
What makes a standout Common App personal statement (apply all of this):
- FOCUS: one specific moment, relationship, object, or turning point — not a
  resume or a life summary. Narrow and deep beats broad and shallow.
- HOOK: open in the middle of a concrete scene, action, or vivid detail — not a
  thesis, a quote, or "Ever since I was young...". The first two lines must make
  a reader want the third.
- SHOW, DON'T TELL: sensory, specific details and dialogue over abstract claims.
  Replace "I am resilient" with a scene that proves it.
- REFLECTION / THE "SO WHAT": at least a third of the essay is insight — what the
  student thought, felt, learned, how they CHANGED. Growth and self-awareness are
  what readers reward most.
- VOICE: sounds like a thoughtful 17-year-old, not a thesaurus or a press
  release. Natural, honest, a little vulnerable. Humor is welcome if it's theirs.
- STRUCTURE: a clear arc (scene → complication → reflection → forward-looking
  close). The ending should land an earned realization, not restate the intro.
- SPECIFICITY OVER IMPRESSIVENESS: a small authentic story (a grandmother's
  kitchen, a failed experiment) outperforms a grand vague one.

Avoid (these sink essays):
- Clichés and trophy narratives: the big game, the mission trip that "opened my
  eyes," "I learned the value of hard work," overcoming-adversity-for-pity.
- Listing achievements already in the activities/honors sections.
- Trying to sound impressive; flowery or inflated vocabulary; melodrama.
- Controversial or risky content played for shock; anything that makes the
  student look unkind. Keep it appropriate for an admissions committee.
- Writing what they think colleges "want to hear" instead of what's true.
`.trim();

const ESSAY_AUTHORSHIP = `
Authorship rules (critical — this essay is submitted under the student's own name):
- Build ONLY from the student's real experiences, details, and feelings as given.
  Never invent events, people, achievements, emotions, or quotes.
- Preserve the student's authentic voice and perspective. Improve clarity,
  structure, imagery, and flow — do not replace their story with a better-sounding
  one that isn't theirs.
- This is a DRAFT for the student to read, edit, and make their own. They remain
  the author and must revise it until it genuinely reflects them.
`.trim();

/**
 * Essay COACHING (mode A): the student brain-dumps everything about themselves
 * related to the prompt; we return an outline + a first draft built only from
 * their material, applying personal-statement best practices. The student then
 * rewrites/edits it in their own voice and submits under their own authorship.
 */
export async function draftEssayScaffold(input: {
  prompt: string;
  wordLimit?: number | null;
  studentNotes: string;
}): Promise<{ outline: string; draft: string; missing: string[] }> {
  const limit = input.wordLimit ?? 650;
  const system = `You are an expert US college-admissions essay coach who has
read thousands of successful Common App personal statements.
${ESSAY_AUTHORSHIP}
${ANTI_FABRICATION}

${ESSAY_CRAFT}

Task: from the student's raw material below, pick the strongest true story and
produce:
1) A short outline (3-5 beats) — scene, complication, reflection, close.
2) A complete first draft between 250 and ${limit} words that applies the craft
   above, using ONLY the student's real material.

Reply in this exact format:
OUTLINE:
<outline>
DRAFT:
<draft>
MISSING:
<specific real details/moments the student could add to make it stronger, or "none">`;

  const user = `Prompt the student chose: ${input.prompt}

Everything the student told us about themselves for this topic:
"${input.studentNotes}"`;

  const raw = await complete(system, user, 2048);
  const outline = (raw.match(/OUTLINE:\s*([\s\S]*?)(?:\nDRAFT:|$)/i)?.[1] ?? "").trim();
  const draft = (raw.match(/DRAFT:\s*([\s\S]*?)(?:\nMISSING:|$)/i)?.[1] ?? "").trim();
  const missing = (raw.match(/MISSING:\s*([\s\S]*)$/i)?.[1] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*\d.]+\s*/, "").trim())
    .filter((l) => l.length > 0 && l.toLowerCase() !== "none");
  return { outline, draft, missing };
}

/**
 * Essay COACHING (mode B): the student has written their OWN draft; we revise it
 * into the strongest college-application version while keeping their voice and
 * facts. This is the "write it yourself first, the system improves it" flow.
 */
export async function refineEssay(input: {
  prompt: string;
  wordLimit?: number | null;
  studentDraft: string;
}): Promise<{ draft: string; notes: string[]; missing: string[] }> {
  const limit = input.wordLimit ?? 650;
  const system = `You are an expert US college-admissions essay coach revising a
student's OWN personal-statement draft into its strongest version.
${ESSAY_AUTHORSHIP}
${ANTI_FABRICATION}

${ESSAY_CRAFT}

Task: revise the student's draft below. Sharpen the hook, cut clichés and filler,
deepen the reflection, and tighten the prose to between 250 and ${limit} words —
WITHOUT inventing anything or overwriting their voice. Keep it recognizably their
essay, only better.

Reply in this exact format:
REVISED:
<the revised essay>
NOTES:
<2-5 short bullets explaining the key changes you made and why>
MISSING:
<specific real details that would strengthen it further, or "none">`;

  const user = `Prompt the student chose: ${input.prompt}

The student's own draft:
"${input.studentDraft}"`;

  const raw = await complete(system, user, 2048);
  const draft = (raw.match(/REVISED:\s*([\s\S]*?)(?:\nNOTES:|\nMISSING:|$)/i)?.[1] ?? "").trim();
  const splitList = (s: string) =>
    s.split("\n").map((l) => l.replace(/^[-*\d.]+\s*/, "").trim())
      .filter((l) => l.length > 0 && l.toLowerCase() !== "none");
  const notes = splitList(raw.match(/NOTES:\s*([\s\S]*?)(?:\nMISSING:|$)/i)?.[1] ?? "");
  const missing = splitList(raw.match(/MISSING:\s*([\s\S]*)$/i)?.[1] ?? "");
  return { draft, notes, missing };
}
