"use client";

// SPIKE — OpenUI generative-report prototype.
//
// Renders a representative deep-research report (openui-lang) through OpenUI's
// <Renderer> to evaluate the "model designs the UI" wow factor on this app's
// real stack, WITHOUT touching the agent. Reachable at /report-preview.
//
// In production, the agent's report step would emit the openui-lang (instead of
// final_report.md markdown) and we'd feed the streamed AI message text straight
// into <Renderer>. The "Replay streaming" toggle below simulates that
// shell-first streaming from the static fixture.
//
// Loaded client-only (see page.tsx, next/dynamic ssr:false): OpenUI's Renderer
// touches `document` at render time and cannot be server-prerendered.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Renderer,
  type ActionEvent,
  BuiltinActionType,
} from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import { SAMPLE_REPORT } from "./openui-report.fixture";

const STREAM_LINE_MS = 90;

export default function OpenUIReport() {
  const [streaming, setStreaming] = useState(false);
  const [shownLines, setShownLines] = useState<number>(Infinity);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const lines = useMemo(() => SAMPLE_REPORT.split("\n"), []);

  // Reveal the openui-lang line-by-line to demo shell-first progressive
  // rendering (root appears first, then each section fills in).
  const startReplay = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setLastAction(null);
    setStreaming(true);
    setShownLines(1);
    timer.current = setInterval(() => {
      setShownLines((n) => {
        const next = n + 1;
        if (next >= lines.length) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setStreaming(false);
          return Infinity;
        }
        return next;
      });
    }, STREAM_LINE_MS);
  }, [lines.length]);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const response = useMemo(
    () =>
      shownLines === Infinity
        ? SAMPLE_REPORT
        : lines.slice(0, shownLines).join("\n"),
    [shownLines, lines],
  );

  const handleAction = useCallback((event: ActionEvent) => {
    // In the real app this routes back into stream.submit() as a new user turn.
    if (event.type === BuiltinActionType.ContinueConversation) {
      setLastAction(`→ would ask the agent: "${event.humanFriendlyMessage}"`);
    } else {
      setLastAction(`action: ${event.type}`);
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            OpenUI report — spike preview
          </h1>
          <p className="text-sm text-muted-foreground">
            A model-generated <code>openui-lang</code> report rendered by
            OpenUI&apos;s <code>&lt;Renderer&gt;</code>. Not wired to the agent.
          </p>
        </div>
        <button
          onClick={startReplay}
          disabled={streaming}
          className="shrink-0 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted/50 disabled:opacity-50"
        >
          {streaming ? "Streaming…" : "Replay streaming"}
        </button>
      </div>

      {lastAction && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {lastAction}
        </div>
      )}

      <Renderer
        response={response}
        library={openuiLibrary}
        isStreaming={streaming}
        onAction={handleAction}
      />
    </div>
  );
}
