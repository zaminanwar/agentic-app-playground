"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ListTree } from "lucide-react";
import type { MatrixRow, OutlineSection } from "@/lib/rfp-types";

interface OutlineTreeProps {
  sections: OutlineSection[];
  rows: MatrixRow[];
  activeSectionId: string | null;
  onSelect: (sectionId: string | null) => void;
}

export function OutlineTree({
  sections,
  rows,
  activeSectionId,
  onSelect,
}: OutlineTreeProps): React.ReactNode {
  // Requirement count per section id, for an at-a-glance density view.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.section_id) map.set(r.section_id, (map.get(r.section_id) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTree className="size-4" />
        Outline
      </div>
      <div className="flex-1 overflow-auto p-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            activeSectionId === null ? "bg-blue-50 text-blue-700" : "hover:bg-muted",
          )}
        >
          <span className="font-medium">All requirements</span>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        </button>

        {sections.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            The outline appears once the structure agent runs.
          </p>
        )}

        {sections.map((s) => {
          const active = s.section_id === activeSectionId;
          const count = counts.get(s.section_id) ?? 0;
          const level = Math.min(Math.max(s.level ?? 1, 1), 5);
          return (
            <button
              key={`${s.section_id}-${s.title}`}
              type="button"
              onClick={() => onSelect(s.section_id || null)}
              style={{ paddingLeft: 8 + (level - 1) * 12 }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
                active ? "bg-blue-50 text-blue-700" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0 truncate">
                {s.section_id && (
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                    {s.section_id}
                  </span>
                )}
                <span className={cn(s.kind === "header" && "font-medium")}>{s.title}</span>
              </span>
              {count > 0 && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
