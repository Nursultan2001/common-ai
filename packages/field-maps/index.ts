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
  | "file";

export interface FieldMapping {
  /** Dot path into the autofill payload, e.g. "profile.legalFirstName". */
  source: string;
  /** CSS selector(s) for the field on the page. First match wins. */
  selectors: string[];
  kind: FieldKind;
  /** For select/radio: map a source value to the option value/label. */
  valueMap?: Record<string, string>;
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
