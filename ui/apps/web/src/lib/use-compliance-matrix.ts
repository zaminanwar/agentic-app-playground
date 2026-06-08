"use client";

/**
 * Editable view over the agent's compliance matrix.
 *
 * The agent owns `compliance_matrix.json` in graph state. Reviewers edit cells
 * (domain, compliance status, evidence, notes) in the UI; this hook layers those
 * edits over the agent's rows for instant feedback and persists the merged matrix
 * back to the same state channel via `client.threads.updateState`, so edits are
 * durable (Postgres checkpointer) and visible to the agent on the next turn.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryState } from "nuqs";
import { createClient } from "@/providers/client";
import { getApiKey } from "@/lib/api-key";
import type { AgentFiles } from "@/lib/agent-types";
import {
  MATRIX_PATH,
  parseMatrix,
  serializeMatrix,
  type MatrixRow,
} from "@/lib/rfp-types";

/** Per-row, per-field reviewer overrides keyed by requirement id. */
type Overrides = Record<string, Partial<MatrixRow>>;

const SAME_ORIGIN_API_PATH = "/api/agent";

function sameOriginApiUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${SAME_ORIGIN_API_PATH}`;
  }
  return SAME_ORIGIN_API_PATH;
}

export interface UseComplianceMatrix {
  rows: MatrixRow[] | null;
  updateRow: (id: string, patch: Partial<MatrixRow>) => void;
  saving: boolean;
}

export function useComplianceMatrix(files: AgentFiles | undefined): UseComplianceMatrix {
  const [threadId] = useQueryState("threadId");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agentRows = useMemo(() => parseMatrix(files), [files]);

  // Merge agent rows with reviewer overrides (overrides win, per field).
  const rows = useMemo<MatrixRow[] | null>(() => {
    if (!agentRows) return null;
    return agentRows.map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r));
  }, [agentRows, overrides]);

  const persist = useCallback(
    (merged: MatrixRow[]) => {
      if (!threadId) return; // No thread yet — keep edits local until a run exists.
      setSaving(true);
      const client = createClient(sameOriginApiUrl(), getApiKey() ?? undefined);
      client.threads
        .updateState(threadId, {
          values: {
            files: {
              [MATRIX_PATH]: { content: serializeMatrix(merged), encoding: "utf-8" },
            },
          },
        })
        .catch((err) => console.error("Failed to persist matrix edit", err))
        .finally(() => setSaving(false));
    },
    [threadId],
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<MatrixRow>) => {
      setOverrides((prev) => {
        const next = { ...prev, [id]: { ...prev[id], ...patch } };
        // Debounce persistence so rapid edits (typing notes) batch into one write.
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          const base = parseMatrix(files);
          if (base) {
            persist(base.map((r) => (next[r.id] ? { ...r, ...next[r.id] } : r)));
          }
        }, 800);
        return next;
      });
    },
    [files, persist],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return { rows, updateRow, saving };
}
