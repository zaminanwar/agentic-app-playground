// Phase 1 bridge: convert this app's LangGraph `useStream` messages into
// assistant-ui `ThreadMessageLike[]`. This is the heart of the Path A
// migration — assistant-ui owns the chat runtime/UI while our existing
// `@langchain/langgraph-sdk/react` stream stays the source of truth.
//
// Tool results arrive as standalone `tool` messages on the LangGraph stream;
// assistant-ui expects them attached to the assistant message's matching
// tool-call part, so we fold them in here.

import type {
  AIMessage,
  Message,
  ToolMessage,
} from "@langchain/langgraph-sdk";
import type { ThreadMessageLike } from "@assistant-ui/react";
import { getContentString } from "../thread/utils";

type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
};

type AssistantPart = { type: "text"; text: string } | ToolCallPart;

export function toThreadMessages(messages: Message[]): ThreadMessageLike[] {
  const out: ThreadMessageLike[] = [];
  // tool_call_id -> the tool-call part awaiting its result.
  const pendingToolParts = new Map<string, ToolCallPart>();

  for (const m of messages) {
    if (m.type === "human") {
      out.push({
        role: "user",
        id: m.id,
        content: [{ type: "text", text: getContentString(m.content) }],
      });
      continue;
    }

    if (m.type === "ai") {
      const ai = m as AIMessage;
      const parts: AssistantPart[] = [];

      for (const tc of ai.tool_calls ?? []) {
        const part: ToolCallPart = {
          type: "tool-call",
          toolCallId: tc.id ?? "",
          toolName: tc.name,
          args: (tc.args ?? {}) as Record<string, unknown>,
        };
        parts.push(part);
        if (tc.id) pendingToolParts.set(tc.id, part);
      }

      const text = getContentString(ai.content);
      if (text.trim()) parts.push({ type: "text", text });

      // assistant-ui requires non-empty content.
      if (parts.length === 0) parts.push({ type: "text", text: "" });

      // `args` is JSON from the agent; cast to assistant-ui's content type
      // (its tool-call part types args as ReadonlyJSONObject).
      out.push({
        role: "assistant",
        id: ai.id,
        content: parts as ThreadMessageLike["content"],
      });
      continue;
    }

    if (m.type === "tool") {
      const tool = m as ToolMessage;
      const part = pendingToolParts.get(tool.tool_call_id);
      // Fold the result into the matching tool-call part (rendered by the
      // tool UI). The `task` subagent result is also surfaced live via
      // getSubagent(), so this mainly covers replayed history.
      if (part) part.result = getContentString(tool.content);
      continue;
    }

    // system / other — render as plain text so nothing is silently dropped.
    out.push({
      role: "system",
      id: m.id,
      content: [{ type: "text", text: getContentString(m.content) }],
    });
  }

  return out;
}
