"use client";

// Renders non-`task` tool calls inside assistant-ui's tool slot, mirroring the
// main chat's classification: planning/filesystem "housekeeping" tools collapse
// to a compact chip (their real effect shows in the workspace panel); anything
// else gets a small expandable card. The `task` tool is handled separately by
// SubagentToolUI.

import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  ChevronDown,
  FilePen,
  FilePlus2,
  FileText,
  FolderOpen,
  ListTodo,
  Search,
  Wrench,
} from "lucide-react";
import { classifyToolCall, fileBasename } from "@/lib/agent-types";
import { cn } from "@/lib/utils";

function housekeepingChip(toolName: string, args: Record<string, unknown>) {
  const file = args?.file_path ? fileBasename(String(args.file_path)) : "";
  switch (toolName) {
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
      return { icon: <FileText className="size-3.5" />, label: toolName };
  }
}

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  args,
  result,
}) => {
  const [open, setOpen] = useState(false);
  const argsObj = (args ?? {}) as Record<string, unknown>;

  if (classifyToolCall(toolName) === "housekeeping") {
    const { icon, label } = housekeepingChip(toolName, argsObj);
    return (
      <span className="my-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
    );
  }

  return (
    <div className="my-1 w-full max-w-2xl overflow-hidden rounded-lg border bg-card text-sm shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 font-medium">
          <Wrench className="size-3.5 text-muted-foreground" />
          {toolName}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs">
            {JSON.stringify(argsObj, null, 2)}
          </pre>
          {result != null && (
            <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs">
              {typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
