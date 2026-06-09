// Field-map template types + loader.
// A template maps stable profile paths -> DOM selectors for a specific portal
// page. This library is the engineering moat: confirmed mappings accumulate here
// and the extension applies them deterministically. The LLM is only a fallback
// for unrecognized fields (low-confidence mappings go to human review and, once
// confirmed, are written back here).

export type FieldKind =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "number"
  | "select"
  | "checkbox"
  | "radio"
  | "textarea"
  | "file"
  // Angular Material custom widgets (Common App): filled by clicking, not by
  // setting .value. mat-select/mat-autocomplete open an overlay of options.
  | "mat-select"
  | "mat-radio"
  | "mat-autocomplete";

export interface FieldMapping {
  /** Dot path into the autofill payload, e.g. "profile.legalFirstName". */
  source: string;
  /**
   * Selector strategies, tried in order — first match wins. Each entry is
   * either plain CSS, or a prefixed strategy that resists auto-generated class
   * names (preferred for Common App):
   *   "label:First name"  → input associated with a <label> containing the text
   *   "name:legalFirstName" → [name="legalFirstName"]
   *   "aria:Date of birth"  → [aria-label*="…" i]
   *   "placeholder:you@…"   → [placeholder*="…" i]
   *   "css:#id" or "#id"    → CSS selector (default when no prefix)
   * Authoring tip: use the extension's "Capture fields" button on the live page
   * to generate these automatically, then verify.
   */
  selectors: string[];
  kind: FieldKind;
  /** For select/radio: map a source value to the option value/label. */
  valueMap?: Record<string, string>;
  /**
   * For kind "date": how to format the value into the text field.
   * e.g. "MM/DD/YYYY" (Common App), "DD/MM/YYYY", "YYYY-MM-DD". Default ISO.
   */
  format?: string;
  /** If true, fill but flag for explicit student confirmation (sensitive). */
  requiresConfirm?: boolean;
}

export interface RepeatingSection {
  /** Source array path, e.g. "activities". */
  source: string;
  /** Selector for the "add another" button, if the portal needs row creation. */
  addButtonSelector?: string;
  /** Per-row container selector, indexed in document order. */
  rowSelector: string;
  /** Mappings relative to each row container. */
  fields: FieldMapping[];
}

export interface PageMap {
  /** URL glob this page map applies to. */
  urlPattern: string;
  name: string;
  fields: FieldMapping[];
  repeating?: RepeatingSection[];
}

export interface FieldMapTemplate {
  key: string; // matches University.fieldMapKey
  portal: string; // "COMMON_APP" | "DIRECT" | ...
  version: number;
  pages: PageMap[];
}

import commonApp from "./templates/commonapp.json";
import localhostTest from "./templates/localhost-test.json";

const REGISTRY: Record<string, FieldMapTemplate> = {
  "common-app-core": commonApp as FieldMapTemplate,
  "localhost-test": localhostTest as FieldMapTemplate,
};

export function getTemplate(key: string): FieldMapTemplate | null {
  return REGISTRY[key] ?? null;
}

export function listTemplates(): string[] {
  return Object.keys(REGISTRY);
}
