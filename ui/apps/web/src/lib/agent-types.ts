/**
 * Typed views over the Deep Agent's graph state.
 *
 * The Python agent is built with `deepagents.create_deep_agent` (deepagents
 * 0.6.x). Its harness middleware writes two state channels the UI cares about
 * beyond `messages`:
 *
 *   - `todos`  — the live plan produced by the `write_todos` tool.
 *                Item shape `{ content, status }`, status one of
 *                pending | in_progress | completed.
 *   - `files`  — the virtual filesystem (StateBackend keeps it in graph state).
 *                A map of absolute path -> FileData. The orchestrator drafts its
 *                report into `final_report.md` here.
 *
 * With `streamMode: ["values"]` the SDK exposes the full, merged snapshot of
 * these channels via `stream.values.todos` / `stream.values.files`, so the
 * workspace panels render them reactively with no extra wiring.
 *
 * Subagent delegation is surfaced from the built-in `task` tool: the
 * orchestrator calls `task({ description, subagent_type })`, and the subagent's
 * final report comes back as the matching tool message.
 */

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface Todo {
  content: string;
  status: TodoStatus;
}

/** Mirrors deepagents `FileData` (backends/protocol.py). */
export interface FileData {
  /** utf-8 text, or base64 when `encoding === "base64"`. */
  content: string;
  encoding: string;
  created_at?: string;
  modified_at?: string;
}

/** Virtual filesystem: absolute path -> file data. */
export type AgentFiles = Record<string, FileData>;

// --- Tool-call classification ------------------------------------------------
// The orchestrator emits a mix of tool calls. Some are best shown as their own
// rich views (delegation, search) and some are "housekeeping" whose real output
// already lives in a workspace panel (the plan, the filesystem). Classifying
// them lets the chat stay readable instead of dumping raw JSON tables.

/** The deepagents delegation tool. Args: `{ description, subagent_type }`. */
export const TASK_TOOL_NAME = "task";

/** Planning + filesystem tools whose effect is surfaced in the workspace panels. */
export const HOUSEKEEPING_TOOLS = new Set([
  "write_todos",
  "write_file",
  "read_file",
  "edit_file",
  "ls",
  "glob",
  "grep",
]);

export type ToolCallKind = "task" | "housekeeping" | "other";

export function classifyToolCall(name: string | undefined): ToolCallKind {
  if (!name) return "other";
  if (name === TASK_TOOL_NAME) return "task";
  if (HOUSEKEEPING_TOOLS.has(name)) return "housekeeping";
  return "other";
}

/** Decode a file's stored content for display. Binary files are not inlined. */
export function decodeFileContent(file: FileData): {
  text: string;
  isBinary: boolean;
} {
  if (file.encoding === "base64") {
    return { text: "", isBinary: true };
  }
  return { text: file.content ?? "", isBinary: false };
}

/** Heuristic: treat .md / .markdown (and the report) as rendered markdown. */
export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path) || path.endsWith("final_report.md");
}

/** Friendly basename for a virtual path. */
export function fileBasename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}
