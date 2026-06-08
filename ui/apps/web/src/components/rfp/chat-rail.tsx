"use client";

import { FormEvent, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { LoaderCircle } from "lucide-react";
import type { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { useStreamContext } from "@/providers/Stream";
import { AssistantMessage, AssistantMessageLoading } from "@/components/thread/messages/ai";
import { HumanMessage } from "@/components/thread/messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import { Button } from "@/components/ui/button";

// Secondary assistant rail: refine the analysis, ask why a requirement was
// classified a certain way, or re-run a step. The matrix (not chat) is the hero,
// so this stays a narrow column.
export function ChatRail(): React.ReactNode {
  const stream = useStreamContext();
  const messages = stream.messages;
  const isLoading = stream.isLoading;
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const newMessage: Message = { id: uuidv4(), type: "human", content: input };
    const toolMessages = ensureToolCallsHaveResponses(stream.messages);
    stream.submit(
      { messages: [...toolMessages, newMessage] },
      {
        streamMode: ["values", "messages-tuple"],
        streamSubgraphs: true,
        optimisticValues: (prev) => ({
          ...prev,
          messages: [...(prev.messages ?? []), ...toolMessages, newMessage],
        }),
      },
    );
    setInput("");
  };

  const handleRegenerate = (parentCheckpoint: Checkpoint | null | undefined) => {
    stream.submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ["values", "messages-tuple"],
      streamSubgraphs: true,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Assistant
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-3">
        {messages
          .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
          .map((message, index) =>
            message.type === "human" ? (
              <HumanMessage
                key={message.id || `human-${index}`}
                message={message}
                isLoading={isLoading}
              />
            ) : (
              <AssistantMessage
                key={message.id || `ai-${index}`}
                message={message}
                isLoading={isLoading}
                handleRegenerate={handleRegenerate}
              />
            ),
          )}
        {isLoading && <AssistantMessageLoading />}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-border p-2">
        <div className="flex flex-col gap-2 rounded-xl border bg-muted/60 p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                (e.target as HTMLElement).closest("form")?.requestSubmit();
              }
            }}
            placeholder="Ask to refine the analysis…"
            rows={2}
            className="resize-none border-none bg-transparent px-1 text-sm outline-none focus:ring-0"
          />
          <div className="flex justify-end">
            {isLoading ? (
              <Button type="button" size="sm" onClick={() => stream.stop()}>
                <LoaderCircle className="size-4 animate-spin" />
                Cancel
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={!input.trim()}>
                Send
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
