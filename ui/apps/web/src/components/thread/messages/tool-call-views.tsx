import type { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import {
  FileText,
  FilePlus2,
  FilePen,
  FolderOpen,
  ListTodo,
  Search,
} from "lucide-react";
import { classifyToolCall, fileBasename } from "@/lib/agent-types";
import { useStreamContext } from "@/providers/Stream";
import { ToolCalls } from "./tool-calls";
import { SubagentCard } from "./subagent-card";

type ToolCall = NonNullable<AIMessage["tool_calls"]>[number];

function chipFor(tc: ToolCall): { icon: React.ReactNode; label: string } {
  const args = (tc.args ?? {}) as Record<string, any>;
  const file = args.file_path ? fileBasename(String(args.file_path)) : "";
  switch (tc.name) {
    case "write_todos":
      return { icon: <ListTodo className="size-3.5" />, label: "Updated plan" };
    case "write_file":
      return {
        icon: <FilePlus2 className="size-3.5" />,
        label: file ? `Wrote ${file}` : "Wrote file",
      };
    case "edit_file":
      return {
        icon: <FilePen className="size-3.5" />,
        label: file ? `Edited ${file}` : "Edited file",
      };
    case "read_file":
      return {
        icon: <FileText className="size-3.5" />,
        label: file ? `Read ${file}` : "Read file",
      };
    case "ls":
      return {
        icon: <FolderOpen className="size-3.5" />,
        label: "Listed files",
      };
    case "glob":
      return { icon: <Search className="size-3.5" />, label: "Searched files" };
    case "grep":
      return {
        icon: <Search className="size-3.5" />,
        label: "Searched contents",
      };
    default:
      return { icon: <FileText className="size-3.5" />, label: tc.name };
  }
}

function HousekeepingChips({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (toolCalls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {toolCalls.map((tc, i) => {
        const { icon, label } = chipFor(tc);
        return (
          <span
            key={tc.id ?? i}
            className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            {icon}
            {label}
          </span>
        );
      })}
    </div>
  );
}

/** Compact "N/M complete" row shown when a turn delegates to several subagents. */
function SubagentProgress({ done, total }: { done: number; total: number }) {
  if (total < 2) return null;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="max-w-2xl space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Subagent progress</span>
        <span>
          {done}/{total} complete
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Renders an AI message's tool calls with the right view per kind:
 *   - `task`        -> SubagentCard (live delegation made visible)
 *   - housekeeping  -> compact chips (plan/filesystem effects live in panels)
 *   - everything else -> the generic ToolCalls table
 *
 * Each `task` call is matched to its live subagent stream (v1 SDK
 * `stream.getSubagent(toolCallId)`), falling back to `resultsById`
 * (tool_call_id -> result message) for replayed history without a live stream.
 */
export function ToolCallViews({
  toolCalls,
  resultsById,
}: {
  toolCalls: AIMessage["tool_calls"];
  resultsById: Map<string, ToolMessage>;
}) {
  const { getSubagent } = useStreamContext();

  if (!toolCalls || toolCalls.length === 0) return null;

  const taskCalls = toolCalls.filter(
    (tc) => classifyToolCall(tc.name) === "task",
  );
  const housekeeping = toolCalls.filter(
    (tc) => classifyToolCall(tc.name) === "housekeeping",
  );
  const other = toolCalls.filter((tc) => classifyToolCall(tc.name) === "other");

  // Pair each task call with its live subagent (if any) so we can show status
  // and a per-turn progress summary.
  const tasks = taskCalls.map((tc) => ({
    tc,
    subagent: tc.id ? getSubagent(tc.id) : undefined,
    result: tc.id ? resultsById.get(tc.id) : undefined,
  }));
  const doneCount = tasks.filter(
    ({ subagent, result }) =>
      subagent?.status === "complete" || (!subagent && !!result),
  ).length;

  return (
    <div className="flex w-full flex-col gap-3">
      <SubagentProgress done={doneCount} total={tasks.length} />
      {tasks.map(({ tc, subagent, result }, i) => {
        const args = (tc.args ?? {}) as Record<string, any>;
        return (
          <SubagentCard
            key={tc.id ?? `task-${i}`}
            subagentType={String(args.subagent_type ?? "subagent")}
            description={String(args.description ?? "")}
            subagent={subagent}
            result={result}
          />
        );
      })}
      <HousekeepingChips toolCalls={housekeeping} />
      {other.length > 0 && <ToolCalls toolCalls={other} />}
    </div>
  );
}
