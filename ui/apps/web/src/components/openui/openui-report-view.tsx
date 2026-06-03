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
import { useStreamContext } from "@/providers/Stream";

export default function OpenUIReportView({ source }: { source: string }) {
  const stream = useStreamContext();

  return (
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
            { streamMode: ["values", "messages-tuple"], streamSubgraphs: true },
          );
        }
      }}
    />
  );
}
