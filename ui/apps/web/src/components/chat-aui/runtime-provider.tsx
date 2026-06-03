"use client";

// Phase 1 (assistant-ui spine, Path A): bridge our existing LangGraph
// `useStream` to assistant-ui via `useExternalStoreRuntime`. The stream stays
// the source of truth (messages, subagents, submit/stop); assistant-ui owns the
// thread runtime + UI. Must render UNDER <StreamProvider>.

import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
} from "@assistant-ui/react";
import { useStreamContext } from "@/providers/Stream";
import { toThreadMessages } from "./message-converter";

function appendMessageText(message: AppendMessage): string {
  return message.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");
}

export function AssistantUIRuntimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const stream = useStreamContext();

  const messages = useMemo(
    () => toThreadMessages(stream.messages),
    [stream.messages],
  );

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: stream.isLoading,
    // messages are already ThreadMessageLike — identity convert.
    convertMessage: (m) => m,
    onNew: async (message: AppendMessage) => {
      const text = appendMessageText(message);
      await stream.submit(
        { messages: [{ type: "human", content: text }] },
        {
          // Match the main chat: stream tokens + subagent subgraphs so the
          // subagent cards render live (see providers/Stream.tsx).
          streamMode: ["values", "messages-tuple"],
          streamSubgraphs: true,
        },
      );
    },
    onCancel: async () => {
      stream.stop();
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
