"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileCode2,
  FileText,
  Maximize2,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  decodeFileContent,
  fileBasename,
  isMarkdownPath,
  type AgentFiles,
} from "@/lib/agent-types";
import {
  downloadFile,
  isOpenUIPath,
  isReport,
  pickActivePath,
  sortPaths,
} from "@/lib/report-files";
import { extractSources } from "@/lib/extract-sources";
import {
  Artifact,
  ArtifactActions,
  ArtifactAction,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { ReportBody } from "./report-body";

/** The report, framed as an AI Elements Artifact: title + actions + sources + body. */
export function ArtifactReport({
  files,
  progress,
}: {
  files: AgentFiles;
  progress?: { isLoading: boolean; completed: number; total: number };
}) {
  const paths = useMemo(() => sortPaths(Object.keys(files ?? {})), [files]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep selection valid as files arrive; default to the report.
  useEffect(() => {
    const next = pickActivePath(paths, selected);
    if (next !== selected) setSelected(next);
  }, [paths, selected]);

  // Close the full-screen report on Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // The markdown report text — feeds both the Sources panel and the openui
  // fallback (shown if the dashboard fails to render). Independent of which file
  // is currently displayed.
  const reportMarkdown = useMemo(() => {
    const mdPath =
      paths.find(
        (p) => p === "final_report.md" || p.endsWith("/final_report.md"),
      ) ?? paths.find(isMarkdownPath);
    if (!mdPath) return "";
    const { text: md, isBinary } = decodeFileContent(files[mdPath]);
    return isBinary ? "" : md;
  }, [files, paths]);
  const sources = useMemo(
    () => extractSources(reportMarkdown),
    [reportMarkdown],
  );

  const activePath = selected && files[selected] ? selected : paths[0];
  const activeFile = activePath ? files[activePath] : undefined;
  if (!activePath || !activeFile) return null;

  const { text, isBinary } = decodeFileContent(activeFile);
  const canExpand = isOpenUIPath(activePath) && !isBinary;

  const onCopy = () => {
    if (isBinary || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Artifact className="h-full">
      <ArtifactHeader>
        <div className="flex min-w-0 flex-col">
          <ArtifactTitle>Research Report</ArtifactTitle>
          <ArtifactDescription className="truncate font-mono">
            {activePath}
          </ArtifactDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {progress && progress.total > 0 && (
            <span className="hidden items-center gap-2 sm:flex">
              <span className="text-xs font-medium text-muted-foreground">
                {progress.isLoading ? "Researching" : "Done"} ·{" "}
                {progress.completed}/{progress.total}
              </span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-[width] duration-500"
                  style={{
                    width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                  }}
                />
              </span>
            </span>
          )}
          <ArtifactActions>
            <ArtifactAction
              tooltip={copied ? "Copied" : "Copy"}
              icon={copied ? Check : Copy}
              onClick={onCopy}
              disabled={isBinary}
            />
            <ArtifactAction
              tooltip="Download"
              icon={Download}
              onClick={() => downloadFile(activePath, isBinary ? "" : text)}
              disabled={isBinary}
            />
            {canExpand && (
              <ArtifactAction
                tooltip="Expand"
                icon={Maximize2}
                onClick={() => setExpanded(true)}
              />
            )}
          </ArtifactActions>
        </div>
      </ArtifactHeader>

      {/* File switcher (only when the agent wrote more than the report). */}
      {paths.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b bg-background px-4 py-2">
          {paths.map((path) => {
            const report = isReport(path);
            const active = path === activePath;
            return (
              <button
                key={path}
                onClick={() => setSelected(path)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-foreground/15 bg-foreground text-background"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {report ? (
                  <Star
                    className={cn(
                      "size-3",
                      active
                        ? "fill-amber-300 text-amber-300"
                        : "text-amber-500",
                    )}
                  />
                ) : isMarkdownPath(path) ? (
                  <FileText className="size-3" />
                ) : (
                  <FileCode2 className="size-3" />
                )}
                {fileBasename(path)}
              </button>
            );
          })}
        </div>
      )}

      <ArtifactContent className="bg-muted/10">
        {sources.length > 0 && (
          <Sources className="mb-3 rounded-lg border border-border bg-card px-3 py-2">
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
        <ReportBody
          file={activeFile}
          path={activePath}
          fallbackMarkdown={reportMarkdown}
          className="mx-auto w-full max-w-5xl"
        />
      </ArtifactContent>

      {/* Full-screen report — gives the generative dashboard room to breathe. */}
      {expanded && canExpand && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-5xl rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {activePath}
              </span>
              <ArtifactAction
                tooltip="Close"
                icon={X}
                onClick={() => setExpanded(false)}
              />
            </div>
            <div className="max-h-[85vh] overflow-y-auto p-5">
              <ReportBody
                file={activeFile}
                path={activePath}
                fallbackMarkdown={reportMarkdown}
              />
            </div>
          </div>
        </div>
      )}
    </Artifact>
  );
}
