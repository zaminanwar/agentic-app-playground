"use client";

import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { FileUp, LoaderCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { useStreamContext } from "@/providers/Stream";
import { cn } from "@/lib/utils";

// Build the kickoff message the orchestrator expects (a PDF pointer it can
// pass to ingest_rfp).
function kickoffContent(gsUri: string, filename: string): string {
  return `Analyze the RFP at ${gsUri} (uploaded as "${filename}") and build the compliance matrix.`;
}

export function UploadPanel({ compact = false }: { compact?: boolean }): React.ReactNode {
  const stream = useStreamContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const startRun = useCallback(
    (gsUri: string, filename: string) => {
      const message = {
        id: uuidv4(),
        type: "human" as const,
        content: kickoffContent(gsUri, filename),
      };
      stream.submit(
        { messages: [message] },
        {
          streamMode: ["values", "messages-tuple"],
          streamSubgraphs: true,
          optimisticValues: (prev) => ({
            ...prev,
            messages: [...(prev.messages ?? []), message],
          }),
        },
      );
    },
    [stream],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        toast.error("Please upload a PDF.");
        return;
      }
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? `Upload failed (${res.status}).`);
        }
        toast.success(`Uploaded ${file.name} — starting analysis.`);
        startRun(data.gsUri as string, file.name);
      } catch (err) {
        toast.error("Upload failed", {
          description: (err as Error).message,
          richColors: true,
        });
      } finally {
        setUploading(false);
      }
    },
    [startRun],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {uploading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <FileUp className="size-4" />
          )}
          New RFP
        </button>
      </>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-xl text-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileText className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">RFP Compliance Workspace</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Upload a customer RFP (PDF). The agent extracts the section hierarchy and
            requirements, assigns each a capability domain, and builds an editable
            compliance matrix.
          </p>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors",
            dragging ? "border-blue-400 bg-blue-50" : "border-border bg-muted/40 hover:bg-muted",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <LoaderCircle className="size-7 animate-spin text-blue-500" />
          ) : (
            <FileUp className="size-7 text-muted-foreground" />
          )}
          <div className="text-sm">
            <span className="font-medium text-foreground">Click to upload</span>{" "}
            <span className="text-muted-foreground">or drag and drop a PDF</span>
          </div>
          <p className="text-xs text-muted-foreground">Digital (text-based) PDFs, up to 50 MB.</p>
        </label>
      </div>
    </div>
  );
}
