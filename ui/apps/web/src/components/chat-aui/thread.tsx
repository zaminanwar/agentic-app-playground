"use client";

// Phase 1 spike — a compact chat thread built from assistant-ui primitives,
// driven by our LangGraph stream via the runtime bridge. Intentionally minimal
// styling: the point is to prove the spine + our live subagent cards, not to
// reproduce the full polished thread yet.

import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { SendHorizontal, Wrench } from "lucide-react";
import { MarkdownText } from "../thread/markdown-text";
import { SubagentToolUI } from "./subagent-tool-ui";

const MarkdownTextPart: TextMessagePartComponent = ({ text }) => (
  <MarkdownText>{text}</MarkdownText>
);

// Non-`task` tool calls (filesystem/planning) — the `task` tool is rendered by
// SubagentToolUI (registered globally), so this only catches the rest.
const ToolFallback: ToolCallMessagePartComponent = ({ toolName }) => (
  <span className="my-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
    <Wrench className="size-3.5" />
    {toolName}
  </span>
);

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground">
        <MessagePrimitive.Parts components={{ Text: MarkdownTextPart }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex flex-col gap-1">
      <MessagePrimitive.Parts
        components={{ Text: MarkdownTextPart, tools: { Fallback: ToolFallback } }}
      />
    </MessagePrimitive.Root>
  );
}

export function ChatAuiThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      {/* Registers the live SubagentCard UI for the `task` tool. */}
      <SubagentToolUI />

      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 pt-6">
        <div className="mx-auto w-full max-w-3xl">
          <ThreadPrimitive.Empty>
            <div className="mt-24 text-center text-sm text-muted-foreground">
              Ask the deep-research agent something — assistant-ui spine over the
              same LangGraph stream.
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </div>
      </ThreadPrimitive.Viewport>

      <div className="border-t bg-background px-4 py-3">
        <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border bg-background p-2 shadow-sm">
          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            placeholder="Message the research agent…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <ComposerPrimitive.Send className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            <SendHorizontal className="size-4" />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}
