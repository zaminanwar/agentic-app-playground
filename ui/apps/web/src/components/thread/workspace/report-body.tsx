"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { MarkdownText } from "../markdown-text";
import {
  decodeFileContent,
  isMarkdownPath,
  type FileData,
} from "@/lib/agent-types";
import { isOpenUIPath } from "@/lib/report-files";

// OpenUI report renderer is client-only (its <Renderer> touches `document`),
// so load it with ssr:false.
const OpenUIReportView = dynamic(
  () => import("@/components/openui/openui-report-view"),
  { ssr: false },
);

/** Renders a single agent file's content: openui dashboard, markdown, or raw text. */
export function ReportBody({
  file,
  path,
  className,
  fallbackMarkdown,
}: {
  file: FileData;
  path: string;
  className?: string;
  /** Markdown report text, shown if an openui-lang report fails to render. */
  fallbackMarkdown?: string;
}) {
  const { text, isBinary } = decodeFileContent(file);

  if (isBinary) {
    return (
      <p className={cn("py-4 text-sm text-muted-foreground", className)}>
        Binary file ({file.encoding}) — preview unavailable.
      </p>
    );
  }
  if (isOpenUIPath(path)) {
    return (
      <div className={className}>
        <OpenUIReportView
          source={text}
          fallback={
            fallbackMarkdown ? (
              <MarkdownText>{fallbackMarkdown}</MarkdownText>
            ) : undefined
          }
        />
      </div>
    );
  }
  if (isMarkdownPath(path)) {
    return (
      <div className={className}>
        <MarkdownText>{text}</MarkdownText>
      </div>
    );
  }
  return (
    <pre
      className={cn(
        "whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground",
        className,
      )}
    >
      {text}
    </pre>
  );
}
