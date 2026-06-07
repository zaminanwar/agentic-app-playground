"use client";

// Renders an agent-written openui-lang report (e.g. `final_report.ui`) as a live
// OpenUI dashboard. Client-only — OpenUI's <Renderer> touches `document`, so
// import this with next/dynamic({ ssr: false }). Must render under <StreamProvider>
// (it routes the report's follow-up buttons back into the chat).

import {
  Renderer,
  type ActionEvent,
  BuiltinActionType,
} from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import type { ReactNode } from "react";
import { useStreamContext } from "@/providers/Stream";
import { OpenUIErrorBoundary } from "./openui-error-boundary";

export default function OpenUIReportView({
  source,
  fallback,
}: {
  source: string;
  /** Rendered if the openui-lang is malformed (e.g. the markdown report). */
  fallback?: ReactNode;
}) {
  const stream = useStreamContext();

  return (
    // Keyed on source so a fresh, valid report clears a prior render error.
    <OpenUIErrorBoundary key={source} fallback={fallback}>
      <div className="animate-in fade-in duration-500">
        <Renderer
          response={source}
          library={openuiLibrary}
          isStreaming={false}
          onAction={(event: ActionEvent) => {
            // A report "Explore further" button → ask the agent that follow-up.
            if (event.type === BuiltinActionType.ContinueConversation) {
              stream.submit(
                {
                  messages: [
                    { type: "human", content: event.humanFriendlyMessage },
                  ],
                },
                {
                  streamMode: ["values", "messages-tuple"],
                  streamSubgraphs: true,
                },
              );
            }
          }}
        />
      </div>
    </OpenUIErrorBoundary>
  );
}
