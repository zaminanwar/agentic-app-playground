"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FileText, FolderOpen, Telescope, Workflow } from "lucide-react";
import { useStreamContext } from "@/providers/Stream";
import { type AgentFiles } from "@/lib/agent-types";
import { cn } from "@/lib/utils";
import { Loader } from "@/components/ai-elements/loader";
import { PlanPanel } from "./plan-panel";
import { ArtifactReport } from "./artifact-report";

// React Flow measures the DOM, so load the graph client-only.
const AgentGraph = dynamic(() => import("./agent-graph"), { ssr: false });

// Stable reference so child memos don't re-run every render before any files exist.
const EMPTY_FILES: AgentFiles = {};

function ViewTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * The artifact-first hero pane. Two views: the report (framed as an AI Elements
 * Artifact) and a live "Flow" graph of the agent's subagent delegations. Before
 * a report file exists, the report view shows the live plan as a building state.
 */
export function ArtifactCanvas() {
  const stream = useStreamContext();
  const todos = stream.values?.todos ?? [];
  const files = stream.values?.files ?? EMPTY_FILES;
  const fileCount = Object.keys(files).length;
  const isLoading = stream.isLoading;
  const [view, setView] = useState<"report" | "flow">("report");

  const total = todos.length;
  const completed = todos.filter((t) => t.status === "completed").length;

  return (
    <div className="flex h-full w-full flex-col bg-muted/20">
      <div className="flex items-center gap-1 px-4 pt-3">
        <ViewTab
          active={view === "report"}
          onClick={() => setView("report")}
          icon={<FileText className="size-3.5" />}
        >
          Report
        </ViewTab>
        <ViewTab
          active={view === "flow"}
          onClick={() => setView("flow")}
          icon={<Workflow className="size-3.5" />}
        >
          Flow
        </ViewTab>
      </div>

      <div className="min-h-0 flex-1 p-4 pt-3">
        {view === "flow" ? (
          <div className="h-full overflow-hidden rounded-lg border bg-background">
            <AgentGraph />
          </div>
        ) : fileCount > 0 ? (
          <ArtifactReport
            files={files}
            progress={{ isLoading, completed, total }}
          />
        ) : (
          <div className="flex h-full items-start justify-center overflow-y-auto">
            <div className="mt-[6vh] w-full max-w-md">
              {isLoading || total > 0 ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Telescope className="size-4 text-blue-500" />
                    Researching — your report will build here.
                    {isLoading && <Loader size={14} className="ml-1" />}
                  </div>
                  <PlanPanel todos={todos} isLoading={isLoading} />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 pt-[6vh] text-center text-sm text-muted-foreground">
                  <FolderOpen className="size-6 text-muted-foreground/50" />
                  The agent&apos;s report and artifacts will appear here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
