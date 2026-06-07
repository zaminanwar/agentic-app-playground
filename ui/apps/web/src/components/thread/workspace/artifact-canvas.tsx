"use client";

import { useMemo } from "react";
import { FolderOpen, Sparkles, Telescope } from "lucide-react";
import { useStreamContext } from "@/providers/Stream";
import {
  decodeFileContent,
  isMarkdownPath,
  type AgentFiles,
} from "@/lib/agent-types";
import { extractSources } from "@/lib/extract-sources";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "@/components/ai-elements/sources";
import { PlanPanel } from "./plan-panel";
import { FilesPanel } from "./files-panel";

// Stable reference so the sources useMemo doesn't re-run every render when the
// agent hasn't written any files yet.
const EMPTY_FILES: AgentFiles = {};

/**
 * The artifact-first hero pane. The agent's report is the product, so it gets
 * the dominant column. Before a report file exists, the live plan stands in as
 * the "building" state so the space is never dead while research runs.
 */
export function ArtifactCanvas() {
  const stream = useStreamContext();
  const todos = stream.values?.todos ?? [];
  const files = stream.values?.files ?? EMPTY_FILES;
  const fileCount = Object.keys(files).length;
  const isLoading = stream.isLoading;

  const total = todos.length;
  const completed = todos.filter((t) => t.status === "completed").length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  // Derive the report's cited sources from the markdown report (prefer
  // `final_report.md`, fall back to any markdown file).
  const sources = useMemo(() => {
    const entries = Object.entries(files);
    const path =
      entries.find(
        ([p]) => p === "final_report.md" || p.endsWith("/final_report.md"),
      )?.[0] ?? entries.find(([p]) => isMarkdownPath(p))?.[0];
    if (!path) return [];
    const { text, isBinary } = decodeFileContent(files[path]);
    return isBinary ? [] : extractSources(text);
  }, [files]);

  return (
    <div className="flex h-full w-full flex-col bg-muted/20">
      {/* Canvas header: title + always-visible research progress. */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Sparkles className="size-4 text-blue-500" />
          Research Report
        </span>
        {total > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {isLoading ? "Researching" : "Done"} · {completed}/{total}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Body: the report is the hero; before it exists, show the live plan. */}
      {fileCount > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          {sources.length > 0 && (
            <Sources className="shrink-0 rounded-lg border border-border bg-card px-3 py-2">
              <SourcesTrigger count={sources.length} />
              <SourcesContent>
                {sources.map((s) => (
                  <Source
                    key={s.url}
                    href={s.url}
                    title={s.title}
                    hostname={s.hostname}
                  />
                ))}
              </SourcesContent>
            </Sources>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <FilesPanel files={files} fill />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6">
          <div className="mt-[8vh] w-full max-w-md">
            {isLoading || total > 0 ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Telescope className="size-4 text-blue-500" />
                  Researching — your report will build here.
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
  );
}
