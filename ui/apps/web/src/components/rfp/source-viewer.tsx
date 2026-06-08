"use client";

import { useMemo } from "react";
import { FileSearch } from "lucide-react";
import type { MatrixRow } from "@/lib/rfp-types";

interface SourceViewerProps {
  row: MatrixRow | null;
  pages: Record<string, string>;
}

// Try to locate the verbatim text within the page so we can highlight it. RFP
// extraction collapses whitespace differently than the stored verbatim, so we
// match on a normalized (whitespace-insensitive) basis and map back to the
// original slice.
function findHighlight(
  pageText: string,
  verbatim: string,
): { before: string; match: string; after: string } | null {
  if (!pageText || !verbatim) return null;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const needle = norm(verbatim);
  if (!needle) return null;

  // Build a map from normalized-index -> original-index by walking the page.
  const originalIdx: number[] = [];
  let normalized = "";
  let prevSpace = false;
  for (let i = 0; i < pageText.length; i++) {
    const ch = pageText[i];
    if (/\s/.test(ch)) {
      if (!prevSpace && normalized.length > 0) {
        normalized += " ";
        originalIdx.push(i);
      }
      prevSpace = true;
    } else {
      normalized += ch.toLowerCase();
      originalIdx.push(i);
      prevSpace = false;
    }
  }
  const start = normalized.indexOf(needle);
  if (start === -1) return null;
  const end = start + needle.length - 1;
  const origStart = originalIdx[start];
  const origEnd = originalIdx[Math.min(end, originalIdx.length - 1)] + 1;
  return {
    before: pageText.slice(0, origStart),
    match: pageText.slice(origStart, origEnd),
    after: pageText.slice(origEnd),
  };
}

export function SourceViewer({ row, pages }: SourceViewerProps): React.ReactNode {
  const pageText = row?.page != null ? (pages[String(row.page)] ?? "") : "";
  const highlight = useMemo(
    () => (row ? findHighlight(pageText, row.verbatim) : null),
    [pageText, row],
  );

  if (!row) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <FileSearch className="size-6" />
        Select a requirement to see its source text.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">{row.id}</span>
          <span>
            {row.section_id && <span className="font-medium">{row.section_id}</span>}
            {row.page != null && <span className="ml-1">· page {row.page}</span>}
          </span>
        </div>
        <p className="mt-1 rounded-md bg-yellow-50 px-2 py-1.5 text-sm text-foreground">
          {row.verbatim}
        </p>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {pageText ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/90">
            {highlight ? (
              <>
                {highlight.before}
                <mark className="rounded bg-yellow-200 px-0.5">{highlight.match}</mark>
                {highlight.after}
              </>
            ) : (
              pageText
            )}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">
            Source page text isn&apos;t available for this requirement.
          </p>
        )}
      </div>
    </div>
  );
}
