"use client";

import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Todo } from "@/lib/agent-types";

// Compact plan view: the agent's write_todos output, so reviewers can watch the
// long shred (ingest -> structure -> requirements -> domains -> QA) progress.
export function ProgressStrip({
  todos,
  isLoading,
}: {
  todos: Todo[];
  isLoading: boolean;
}): React.ReactNode {
  if (todos.length === 0) {
    if (!isLoading) return null;
    return (
      <div className="flex items-center gap-2 border-b border-border bg-blue-50/50 px-4 py-2 text-sm text-blue-700">
        <LoaderCircle className="size-4 animate-spin" />
        Working…
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-4 py-2 text-xs">
      {todos.map((todo, i) => (
        <span
          key={`${i}-${todo.content}`}
          className={cn(
            "inline-flex items-center gap-1.5",
            todo.status === "completed" && "text-muted-foreground line-through",
            todo.status === "in_progress" && "font-medium text-blue-700",
            todo.status === "pending" && "text-muted-foreground",
          )}
        >
          {todo.status === "completed" ? (
            <CheckCircle2 className="size-3.5 text-green-600" />
          ) : todo.status === "in_progress" ? (
            <LoaderCircle className="size-3.5 animate-spin text-blue-600" />
          ) : (
            <Circle className="size-3.5" />
          )}
          {todo.content}
        </span>
      ))}
    </div>
  );
}
