import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Telescope,
  CheckCircle2,
} from "lucide-react";
import type { ToolMessage } from "@langchain/langgraph-sdk";
import { cn } from "@/lib/utils";
import { MarkdownText } from "../markdown-text";
import { getContentString } from "../utils";

type SubagentVisual = {
  icon: React.ReactNode;
  accent: string; // left border + icon tint
  chip: string; // status chip colors when running
};

function visualFor(subagentType: string): SubagentVisual {
  const t = subagentType.toLowerCase();
  if (t.includes("research")) {
    return {
      icon: <Telescope className="size-4" />,
      accent: "border-l-blue-400 text-blue-600",
      chip: "bg-blue-50 text-blue-700",
    };
  }
  if (t.includes("critique") || t.includes("review") || t.includes("edit")) {
    return {
      icon: <ClipboardCheck className="size-4" />,
      accent: "border-l-violet-400 text-violet-600",
      chip: "bg-violet-50 text-violet-700",
    };
  }
  return {
    icon: <Bot className="size-4" />,
    accent: "border-l-gray-400 text-gray-600",
    chip: "bg-gray-100 text-gray-700",
  };
}

export interface SubagentCardProps {
  subagentType: string;
  description: string;
  result?: ToolMessage;
}

/**
 * Renders a deepagents `task` delegation as a card: which subagent was spawned,
 * the task it was given, and (when it returns) its final report. The subagent
 * runs in an isolated context, so only its final message comes back on the main
 * stream — this card makes that delegation visible instead of a raw JSON table.
 */
export function SubagentCard({
  subagentType,
  description,
  result,
}: SubagentCardProps) {
  const done = !!result;
  const [expanded, setExpanded] = useState(!done);
  const visual = visualFor(subagentType);
  const resultText = result ? getContentString(result.content) : "";

  return (
    <div
      className={cn(
        "w-full max-w-2xl overflow-hidden rounded-xl border border-l-[3px] bg-card shadow-sm",
        visual.accent,
      )}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={cn("shrink-0", visual.accent)}>{visual.icon}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold capitalize text-foreground">
              {subagentType.replace(/[-_]/g, " ")}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {done ? "Returned findings" : "Working…"}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {done ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3" />
              Done
            </span>
          ) : (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                visual.chip,
              )}
            >
              <Loader2 className="size-3 animate-spin" />
              Running
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="space-y-3 px-3.5 py-3">
              {description && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Task: </span>
                  {description}
                </div>
              )}
              {done ? (
                <div className="max-h-80 overflow-y-auto text-sm [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
                  <MarkdownText>{resultText}</MarkdownText>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Searching sources in an isolated context…
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
