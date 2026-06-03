"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Download,
  FileText,
  FileCode2,
  Star,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownText } from "../markdown-text";
import { TooltipIconButton } from "../tooltip-icon-button";
import {
  decodeFileContent,
  fileBasename,
  isMarkdownPath,
  type AgentFiles,
} from "@/lib/agent-types";

// OpenUI report renderer is client-only (its <Renderer> touches `document`),
// so load it with ssr:false.
const OpenUIReportView = dynamic(
  () => import("@/components/openui/openui-report-view"),
  { ssr: false },
);

// The agent writes the report as an interactive openui-lang dashboard
// (`final_report.ui`, preferred) alongside the markdown source.
const REPORT_PATHS = ["final_report.ui", "final_report.md"];

function isOpenUIPath(path: string): boolean {
  return path.endsWith(".ui");
}

function isReport(path: string): boolean {
  return REPORT_PATHS.some((r) => path === r || path.endsWith(`/${r}`));
}

/** Sort: the report first, then the rest alphabetically. */
function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    if (isReport(a) !== isReport(b)) return isReport(a) ? -1 : 1;
    return a.localeCompare(b);
  });
}

function downloadFile(path: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileBasename(path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function FilesPanel({ files }: { files: AgentFiles }) {
  const paths = useMemo(() => sortPaths(Object.keys(files ?? {})), [files]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Close the full-screen report on Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Default to the report (or first file); keep selection valid as files change.
  useEffect(() => {
    if (paths.length === 0) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!selected || !paths.includes(selected)) {
      setSelected(paths.find(isOpenUIPath) ?? paths.find(isReport) ?? paths[0]);
    }
  }, [paths, selected]);

  if (paths.length === 0) {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
        <FileText className="size-4" />
        Files the agent writes (like the report) show up here.
      </div>
    );
  }

  const activePath = selected && files[selected] ? selected : paths[0];
  const activeFile = files[activePath];
  const { text, isBinary } = decodeFileContent(activeFile);
  const renderOpenUI = isOpenUIPath(activePath) && !isBinary;
  const renderMarkdown = isMarkdownPath(activePath) && !isBinary;

  return (
    <div className="flex flex-col gap-3">
      {/* File switcher */}
      <div className="flex flex-wrap gap-1.5">
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
                    active ? "fill-amber-300 text-amber-300" : "text-amber-500",
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

      {/* Active file */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {activePath}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {renderOpenUI && (
              <TooltipIconButton
                tooltip="Expand"
                variant="ghost"
                className="size-7"
                onClick={() => setExpanded(true)}
              >
                <Maximize2 className="size-4" />
              </TooltipIconButton>
            )}
            <TooltipIconButton
              tooltip="Download"
              variant="ghost"
              className="size-7"
              onClick={() => downloadFile(activePath, isBinary ? "" : text)}
              disabled={isBinary}
            >
              <Download className="size-4" />
            </TooltipIconButton>
          </div>
        </div>
        <div className="max-h-[calc(100vh-22rem)] overflow-y-auto px-4 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
          {isBinary ? (
            <p className="py-4 text-sm text-muted-foreground">
              Binary file ({activeFile.encoding}) — preview unavailable.
            </p>
          ) : renderOpenUI ? (
            <OpenUIReportView source={text} />
          ) : renderMarkdown ? (
            <MarkdownText>{text}</MarkdownText>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {text}
            </pre>
          )}
        </div>
      </div>

      {/* Full-screen report — gives the generative dashboard room to breathe. */}
      {expanded && renderOpenUI && (
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
              <TooltipIconButton
                tooltip="Close"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => setExpanded(false)}
              >
                <X className="size-4" />
              </TooltipIconButton>
            </div>
            <div className="max-h-[85vh] overflow-y-auto p-5">
              <OpenUIReportView source={text} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
