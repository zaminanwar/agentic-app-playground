import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Telescope,
  CheckCircle2,
  TriangleAlert,
} from "lucide-react";
import type { Message, ToolMessage } from "@langchain/langgraph-sdk";
import type {
  SubagentStatus,
  SubagentStreamInterface,
} from "@langchain/langgraph-sdk/react";
import { cn } from "@/lib/utils";
import { MarkdownText } from "../markdown-text";
import { getContentString } from "../utils";

/** A live subagent stream as exposed by the v1 SDK's `stream.subagents`. */
export type SubagentStream = SubagentStreamInterface;

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

/** Latest assistant text emitted by the subagent's scoped stream. */
function latestAssistantText(messages: Message[] | undefined): string {
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "ai") {
      const text = getContentString(messages[i].content);
      if (text.trim()) return text;
    }
  }
  return "";
}

export interface SubagentCardProps {
  subagentType: string;
  description: string;
  /**
   * Live subagent stream (v1 SDK). When present, the card renders the
   * specialist's status and streaming tokens in real time.
   */
  subagent?: SubagentStream;
  /**
   * Fallback for runs without a live subagent stream (e.g. replayed history):
   * the `task` tool-result message carrying the final report.
   */
  result?: ToolMessage;
}

/**
 * Renders a deepagents `task` delegation as a card. With a live `subagent`
 * stream (v1 SDK `stream.subagents`) it shows the specialist's status and
 * streaming output as it works; without one it falls back to the returned
 * tool-result message. Either way the delegation is made visible instead of a
 * raw JSON table.
 */
export function SubagentCard({
  subagentType,
  description,
  subagent,
  result,
}: SubagentCardProps) {
  // Status: prefer the live stream; otherwise infer from the fallback result.
  const status: SubagentStatus =
    subagent?.status ?? (result ? "complete" : "running");
  const done = status === "complete";
  const errored = status === "error";
  const running = status === "running";
  const pending = status === "pending";

  const [expanded, setExpanded] = useState(!done);
  const visual = visualFor(subagentType);

  // Reasoning-style: a subagent tidies itself away once it finishes, keeping the
  // rail focused on what's still working. Manual re-expands aren't fought (the
  // effect only fires on the running -> complete transition).
  useEffect(() => {
    if (done) setExpanded(false);
  }, [done]);

  // Display text: live assistant tokens, then the subagent's final result,
  // then the fallback tool message.
  const liveText = latestAssistantText(subagent?.messages);
  const resultText =
    liveText ||
    subagent?.result ||
    (result ? getContentString(result.content) : "");
  const toolCallCount = subagent?.toolCalls?.length ?? 0;

  const statusLabel = done
    ? "Returned findings"
    : errored
      ? "Failed"
      : pending
        ? "Queued"
        : "Working…";

  return (
    <div
      className={cn(
        "w-full max-w-2xl overflow-hidden rounded-xl border border-l-[3px] bg-card shadow-sm",
        errored ? "border-l-rose-400 text-rose-600" : visual.accent,
      )}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "shrink-0",
              errored ? "text-rose-600" : visual.accent,
            )}
          >
            {errored ? <TriangleAlert className="size-4" /> : visual.icon}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold capitalize text-foreground">
              {subagentType.replace(/[-_]/g, " ")}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {statusLabel}
              {toolCallCount > 0 && (
                <>
                  {" · "}
                  {toolCallCount} tool call{toolCallCount === 1 ? "" : "s"}
                </>
              )}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {done ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3" />
              Done
            </span>
          ) : errored ? (
            <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
              <TriangleAlert className="size-3" />
              Error
            </span>
          ) : (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                visual.chip,
              )}
            >
              <Loader2 className="size-3 animate-spin" />
              {pending ? "Queued" : "Running"}
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
              {resultText ? (
                <div className="max-h-80 overflow-y-auto text-sm [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
                  <MarkdownText>{resultText}</MarkdownText>
                  {running && (
                    <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-blue-500 align-middle" />
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {pending
                    ? "Queued to start…"
                    : "Searching sources in an isolated context…"}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
