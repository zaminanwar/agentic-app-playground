"use client";

// Phase 1 spike route — /chat-aui. The deep-research agent rendered through the
// assistant-ui spine (Path A) over the SAME LangGraph stream as the main chat at
// `/`, so the two can be compared side by side. Reuses the existing providers,
// the live subagent cards (via the tool-UI slot), and the research workspace.

import React from "react";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { Toaster } from "@/components/ui/sonner";
import { AssistantUIRuntimeProvider } from "@/components/chat-aui/runtime-provider";
import { ChatAuiThread } from "@/components/chat-aui/thread";
import { WorkspacePanel } from "@/components/thread/workspace";

export default function ChatAuiPage(): React.ReactNode {
  return (
    <React.Suspense fallback={<div>Loading…</div>}>
      <Toaster />
      <ThreadProvider>
        <StreamProvider>
          <AssistantUIRuntimeProvider>
            <div className="flex h-screen w-full overflow-hidden">
              <div className="min-w-0 flex-1">
                <ChatAuiThread />
              </div>
              <div className="hidden w-[420px] shrink-0 border-l lg:block">
                <WorkspacePanel onClose={() => {}} />
              </div>
            </div>
          </AssistantUIRuntimeProvider>
        </StreamProvider>
      </ThreadProvider>
    </React.Suspense>
  );
}
