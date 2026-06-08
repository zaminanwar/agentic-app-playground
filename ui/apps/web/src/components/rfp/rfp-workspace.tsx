"use client";

import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import {
  FileText,
  LoaderCircle,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Search,
} from "lucide-react";
import { useStreamContext } from "@/providers/Stream";
import { useComplianceMatrix } from "@/lib/use-compliance-matrix";
import { parseOutline, parsePages, type MatrixRow } from "@/lib/rfp-types";
import { DOMAINS, STATUS_META } from "@/lib/rfp-domains";
import type { Todo } from "@/lib/agent-types";
import { cn } from "@/lib/utils";
import { UploadPanel } from "./upload-panel";
import { ComplianceMatrix } from "./compliance-matrix";
import { OutlineTree } from "./outline-tree";
import { SourceViewer } from "./source-viewer";
import { ChatRail } from "./chat-rail";
import { ProgressStrip } from "./progress-strip";

export function RfpWorkspace(): React.ReactNode {
  const stream = useStreamContext();
  const [, setThreadId] = useQueryState("threadId");
  const files = stream.values.files;
  const todos = (stream.values.todos ?? []) as Todo[];
  const isLoading = stream.isLoading;

  const { rows, updateRow, saving } = useComplianceMatrix(files);
  const outline = useMemo(() => parseOutline(files), [files]);
  const pages = useMemo(() => parsePages(files), [files]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sourceOpen, setSourceOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  const hasStarted = stream.messages.length > 0;

  const filteredRows = useMemo<MatrixRow[]>(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sectionFilter && r.section_id !== sectionFilter) return false;
      if (domainFilter !== "all" && r.domain !== domainFilter) return false;
      if (q && !`${r.verbatim} ${r.summary ?? ""} ${r.id}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, sectionFilter, domainFilter, search]);

  const selectedRow = useMemo(
    () => rows?.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) counts[r.compliance_status] = (counts[r.compliance_status] ?? 0) + 1;
    return counts;
  }, [rows]);

  // --- Empty / in-progress states -----------------------------------------
  if (!rows) {
    return (
      <div className="flex h-screen flex-col">
        <TopBar saving={saving} onNew={() => setThreadId(null)} />
        <ProgressStrip todos={todos} isLoading={isLoading} />
        <div className="flex min-h-0 flex-1">
          <div className="flex-1">
            {hasStarted ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <LoaderCircle className="size-6 animate-spin text-blue-500" />
                Analyzing the RFP — extracting structure, requirements, and domains…
              </div>
            ) : (
              <UploadPanel />
            )}
          </div>
          {hasStarted && (
            <div className="hidden w-96 border-l border-border lg:block">
              <ChatRail />
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Loaded matrix ------------------------------------------------------
  return (
    <div className="flex h-screen flex-col">
      <TopBar
        saving={saving}
        onNew={() => setThreadId(null)}
        right={
          <>
            <ToggleButton active={sourceOpen} onClick={() => setSourceOpen((p) => !p)} label="Source">
              {sourceOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </ToggleButton>
            <ToggleButton active={chatOpen} onClick={() => setChatOpen((p) => !p)} label="Assistant">
              <MessageSquare className="size-4" />
            </ToggleButton>
          </>
        }
      />
      <ProgressStrip todos={todos} isLoading={isLoading} />

      {/* Summary + filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <span className="text-sm font-medium">{rows.length} requirements</span>
        <div className="flex items-center gap-1.5">
          {Object.entries(statusCounts).map(([status, count]) => {
            const meta = STATUS_META[status as keyof typeof STATUS_META];
            return (
              <span
                key={status}
                className={cn("rounded-full border px-2 py-0.5 text-xs", meta?.badge)}
              >
                {meta?.label ?? status}: {count}
              </span>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requirements…"
              className="w-56 rounded-md border border-border bg-background py-1 pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="all">All domains</option>
            {DOMAINS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
          <OutlineTree
            sections={outline}
            rows={rows}
            activeSectionId={sectionFilter}
            onSelect={setSectionFilter}
          />
        </aside>

        <main className="min-w-0 flex-1">
          <ComplianceMatrix
            rows={filteredRows}
            selectedId={selectedId}
            onSelect={(row) => {
              setSelectedId(row.id);
              setSourceOpen(true);
            }}
            onUpdate={updateRow}
          />
        </main>

        {sourceOpen && (
          <aside className="hidden w-96 shrink-0 border-l border-border xl:block">
            <SourceViewer row={selectedRow} pages={pages} />
          </aside>
        )}

        {chatOpen && (
          <aside className="hidden w-96 shrink-0 border-l border-border lg:block">
            <ChatRail />
          </aside>
        )}
      </div>
    </div>
  );
}

function TopBar({
  saving,
  onNew,
  right,
}: {
  saving: boolean;
  onNew: () => void;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-blue-600" />
        <span className="text-lg font-semibold tracking-tight">RFP Compliance</span>
      </div>
      <div className="flex items-center gap-2">
        {saving && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Save className="size-3.5" />
            Saving…
          </span>
        )}
        {right}
        <UploadPanel compact />
        <button
          type="button"
          onClick={onNew}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          New thread
        </button>
      </div>
    </header>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
        active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
