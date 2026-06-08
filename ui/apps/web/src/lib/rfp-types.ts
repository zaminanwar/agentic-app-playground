/**
 * Typed views over the RFP agent's virtual-filesystem artifacts.
 *
 * The Python agent (deepagents) writes JSON files into the `files` state channel
 * that the UI reads via `stream.values.files` (path -> FileData). This module
 * parses those artifacts into typed shapes the workspace renders:
 *
 *   - `compliance_matrix.json`            -> { rows: MatrixRow[] }   (the hero)
 *   - `outline.json`                      -> { sections: OutlineSection[] }
 *   - `source/rfp_pages.json`             -> { [page]: text }
 *   - `source/requirement_candidates.json`-> RequirementCandidate[]  (recall floor)
 *
 * Parsing is defensive: the agent streams these files in progressively and they
 * may be absent or mid-write, so every parser returns null/empty rather than
 * throwing.
 */

import type { AgentFiles, FileData } from "./agent-types";

export const MATRIX_PATH = "compliance_matrix.json";
export const OUTLINE_PATH = "outline.json";
export const PAGES_PATH = "source/rfp_pages.json";
export const CANDIDATES_PATH = "source/requirement_candidates.json";

export type ComplianceStatus =
  | "unreviewed"
  | "compliant"
  | "partial"
  | "non-compliant"
  | "not-applicable";

export const COMPLIANCE_STATUSES: ComplianceStatus[] = [
  "unreviewed",
  "compliant",
  "partial",
  "non-compliant",
  "not-applicable",
];

export interface MatrixRow {
  id: string;
  section_id: string;
  page: number | null;
  verbatim: string;
  modal_verb?: string;
  summary?: string;
  domain: string;
  compliance_status: ComplianceStatus;
  evidence?: string;
  notes?: string;
}

export interface OutlineSection {
  section_id: string;
  title: string;
  level?: number;
  parent_id?: string | null;
  page_start?: number | null;
  kind?: "header" | "section";
}

export interface RequirementCandidate {
  page: number;
  sentence: string;
  modal_verb: string;
}

/** Read + JSON-parse a virtual file, returning null on any problem. */
function readJson<T>(files: AgentFiles | undefined, path: string): T | null {
  const file: FileData | undefined = files?.[path];
  if (!file || file.encoding === "base64" || !file.content) return null;
  try {
    return JSON.parse(file.content) as T;
  } catch {
    return null;
  }
}

const VALID_STATUSES = new Set<string>(COMPLIANCE_STATUSES);

function normalizeStatus(value: unknown): ComplianceStatus {
  return typeof value === "string" && VALID_STATUSES.has(value)
    ? (value as ComplianceStatus)
    : "unreviewed";
}

/** Parse the compliance matrix, coercing each row into a stable shape. */
export function parseMatrix(files: AgentFiles | undefined): MatrixRow[] | null {
  const raw = readJson<{ rows?: unknown[] }>(files, MATRIX_PATH);
  if (!raw || !Array.isArray(raw.rows)) return null;

  return raw.rows
    .filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    )
    .map((r, i) => ({
      id:
        typeof r.id === "string" && r.id
          ? r.id
          : `REQ-${String(i + 1).padStart(3, "0")}`,
      section_id: typeof r.section_id === "string" ? r.section_id : "",
      page: typeof r.page === "number" ? r.page : null,
      verbatim: typeof r.verbatim === "string" ? r.verbatim : "",
      modal_verb: typeof r.modal_verb === "string" ? r.modal_verb : undefined,
      summary: typeof r.summary === "string" ? r.summary : undefined,
      domain: typeof r.domain === "string" ? r.domain : "general",
      compliance_status: normalizeStatus(r.compliance_status),
      evidence: typeof r.evidence === "string" ? r.evidence : "",
      notes: typeof r.notes === "string" ? r.notes : "",
    }));
}

export function parseOutline(files: AgentFiles | undefined): OutlineSection[] {
  const raw = readJson<{ sections?: unknown[] }>(files, OUTLINE_PATH);
  if (!raw || !Array.isArray(raw.sections)) return [];
  return raw.sections
    .filter(
      (s): s is Record<string, unknown> => typeof s === "object" && s !== null,
    )
    .map(
      (s): OutlineSection => ({
        section_id: typeof s.section_id === "string" ? s.section_id : "",
        title: typeof s.title === "string" ? s.title : "",
        level: typeof s.level === "number" ? s.level : 1,
        parent_id: typeof s.parent_id === "string" ? s.parent_id : null,
        page_start: typeof s.page_start === "number" ? s.page_start : null,
        kind: s.kind === "header" ? "header" : "section",
      }),
    )
    .filter((s) => s.section_id || s.title);
}

export function parsePages(
  files: AgentFiles | undefined,
): Record<string, string> {
  return readJson<Record<string, string>>(files, PAGES_PATH) ?? {};
}

/** Serialize matrix rows back into the file content the agent expects. */
export function serializeMatrix(rows: MatrixRow[]): string {
  return JSON.stringify({ rows }, null, 2);
}
