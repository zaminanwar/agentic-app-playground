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

// Run options shared by every submit: stream tokens + subagent subgraphs so the
// subagent cards render live (see providers/Stream.tsx).
const RUN_OPTIONS = {
  streamMode: ["values", "messages-tuple"] as ["values", "messages-tuple"],
  streamSubgraphs: true,
};

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

  // The graph checkpoint immediately BEFORE the message with the given id, used
  // to re-run a turn (edit / regenerate) from the right point — mirrors how the
  // main chat reads `firstSeenState.parent_checkpoint`.
  const parentCheckpointOf = (id: string | null | undefined) => {
    if (!id) return undefined;
    const msg = stream.messages.find((m) => m.id === id);
    if (!msg) return undefined;
    return stream.getMessagesMetadata(msg)?.firstSeenState?.parent_checkpoint;
  };

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: stream.isLoading,
    convertMessage: (m) => m, // already ThreadMessageLike
    onNew: async (message: AppendMessage) => {
      await stream.submit(
        { messages: [{ type: "human", content: appendMessageText(message) }] },
        RUN_OPTIONS,
      );
    },
    // Edit a user message and re-run from that turn (checkpoint fork).
    onEdit: async (message: AppendMessage) => {
      await stream.submit(
        { messages: [{ type: "human", content: appendMessageText(message) }] },
        { ...RUN_OPTIONS, checkpoint: parentCheckpointOf(message.sourceId) },
      );
    },
    // Regenerate the assistant response that followed `parentId`.
    onReload: async (parentId: string | null) => {
      const idx = stream.messages.findIndex((m) => m.id === parentId);
      const next = idx >= 0 ? stream.messages[idx + 1] : undefined;
      const checkpoint = next
        ? stream.getMessagesMetadata(next)?.firstSeenState?.parent_checkpoint
        : undefined;
      await stream.submit(undefined, { ...RUN_OPTIONS, checkpoint });
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
