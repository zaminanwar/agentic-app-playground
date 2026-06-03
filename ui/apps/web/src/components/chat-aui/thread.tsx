"use client";

// Phase 1 — the deep-research chat on the assistant-ui spine, driven by our
// LangGraph stream via the runtime bridge. Markdown, full tool rendering, an
// action bar (copy / regenerate), branch navigation, a stop button, scroll-to-
// bottom, and empty-state suggestions. Edit-and-fork is wired in the runtime
// (onEdit) and lands with its composer in a follow-up.

import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  type TextMessagePartComponent,
} from "@assistant-ui/react";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  SendHorizontal,
  Square,
} from "lucide-react";
import { MarkdownText } from "../thread/markdown-text";
import { SubagentToolUI } from "./subagent-tool-ui";
import { ToolFallback } from "./tool-fallback";

const MarkdownTextPart: TextMessagePartComponent = ({ text }) => (
  <MarkdownText>{text}</MarkdownText>
);

const SUGGESTIONS = [
  "What are the most capable open-source LLMs right now?",
  "Summarize the state of AI agents in 2026, with sources.",
  "Compare RAG vs long-context for enterprise search.",
];

function BranchPicker() {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
    >
      <BranchPickerPrimitive.Previous className="hover:text-foreground">
        <ChevronLeft className="size-3.5" />
      </BranchPickerPrimitive.Previous>
      <span>
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next className="hover:text-foreground">
        <ChevronRight className="size-3.5" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="group mb-4 flex flex-col items-end">
      <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground">
        <MessagePrimitive.Parts components={{ Text: MarkdownTextPart }} />
      </div>
      <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <BranchPicker />
        <ActionBarPrimitive.Root>
          <ActionBarPrimitive.Copy className="text-muted-foreground hover:text-foreground">
            <Copy className="size-3.5" />
          </ActionBarPrimitive.Copy>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group mb-5 flex flex-col gap-1">
      <div className="prose prose-sm max-w-none">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownTextPart,
            tools: { Fallback: ToolFallback },
          }}
        />
      </div>
      <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionBarPrimitive.Root className="flex items-center gap-1.5 text-muted-foreground">
          <ActionBarPrimitive.Copy className="hover:text-foreground">
            <Copy className="size-3.5" />
          </ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Reload className="hover:text-foreground">
            <RefreshCw className="size-3.5" />
          </ActionBarPrimitive.Reload>
        </ActionBarPrimitive.Root>
        <BranchPicker />
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border bg-background p-2 shadow-sm">
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Message the research agent…"
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
      />
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
          <SendHorizontal className="size-4" />
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
          <Square className="size-3.5 fill-current" />
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  );
}

export function ChatAuiThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      {/* Registers the live SubagentCard UI for the `task` tool. */}
      <SubagentToolUI />

      <ThreadPrimitive.Viewport className="relative flex-1 overflow-y-auto px-4 pt-6">
        <div className="mx-auto w-full max-w-3xl">
          <ThreadPrimitive.Empty>
            <div className="mt-20 flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Deep-research agent on the assistant-ui spine — same LangGraph
                stream as the main chat.
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <ThreadPrimitive.Suggestion
                    key={s}
                    prompt={s}
                    method="replace"
                    autoSend
                    className="rounded-lg border bg-card px-3 py-2 text-left text-sm shadow-sm hover:bg-muted/50"
                  >
                    {s}
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </div>
        <ThreadPrimitive.ScrollToBottom className="sticky bottom-2 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-md disabled:invisible">
          <ArrowDown className="size-4" />
        </ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>

      <div className="border-t bg-background px-4 py-3">
        <Composer />
      </div>
    </ThreadPrimitive.Root>
  );
}
