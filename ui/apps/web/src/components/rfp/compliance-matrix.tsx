"use client";

import { cn } from "@/lib/utils";
import { DOMAINS, STATUS_META, domainMeta } from "@/lib/rfp-domains";
import {
  COMPLIANCE_STATUSES,
  type ComplianceStatus,
  type MatrixRow,
} from "@/lib/rfp-types";

interface ComplianceMatrixProps {
  rows: MatrixRow[];
  selectedId: string | null;
  onSelect: (row: MatrixRow) => void;
  onUpdate: (id: string, patch: Partial<MatrixRow>) => void;
}

// Native <select> styled to read as an inline badge. Editing is intentionally
// in-cell: reviewers reclassify a domain or set a compliance verdict without
// leaving the matrix.
function CellSelect({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "w-full cursor-pointer rounded-md border bg-transparent px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const DOMAIN_OPTIONS = DOMAINS.map((d) => ({ value: d.id, label: d.label }));
const STATUS_OPTIONS = COMPLIANCE_STATUSES.map((s) => ({
  value: s,
  label: STATUS_META[s].label,
}));

export function ComplianceMatrix({
  rows,
  selectedId,
  onSelect,
  onUpdate,
}: ComplianceMatrixProps): React.ReactNode {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_var(--border)]">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Section</th>
            <th className="px-3 py-2 font-medium">Requirement</th>
            <th className="w-40 px-3 py-2 font-medium">Domain</th>
            <th className="w-40 px-3 py-2 font-medium">Compliance</th>
            <th className="w-56 px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId;
            const dm = domainMeta(row.domain);
            return (
              <tr
                key={row.id}
                onClick={() => onSelect(row)}
                className={cn(
                  "cursor-pointer border-b border-border align-top transition-colors",
                  selected ? "bg-blue-50/70" : "hover:bg-muted/50",
                )}
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                  {row.id}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{row.section_id || "—"}</span>
                  {row.page != null && <span className="ml-1 text-muted-foreground">p.{row.page}</span>}
                </td>
                <td className="max-w-md px-3 py-2">
                  <p className="line-clamp-3 text-foreground">{row.verbatim}</p>
                  {row.summary && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.summary}</p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <CellSelect
                    value={row.domain}
                    options={DOMAIN_OPTIONS}
                    onChange={(v) => onUpdate(row.id, { domain: v })}
                    className={dm.badge}
                  />
                </td>
                <td className="px-3 py-2">
                  <CellSelect
                    value={row.compliance_status}
                    options={STATUS_OPTIONS}
                    onChange={(v) => onUpdate(row.id, { compliance_status: v as ComplianceStatus })}
                    className={STATUS_META[row.compliance_status].badge}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.notes ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdate(row.id, { notes: e.target.value })}
                    placeholder="Add a note…"
                    className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none hover:border-border focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No requirements match the current filter.
        </div>
      )}
    </div>
  );
}
