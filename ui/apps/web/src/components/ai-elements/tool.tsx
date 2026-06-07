"use client";

// AI-Elements-style tool-call disclosure, slimmed to our data. The upstream
// `tool` component couples to the Vercel AI SDK (`ai` ToolUIPart) + badge +
// code-block; we render our own {name, args, result} on our collapsible instead.

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Loader2,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type ToolState = "pending" | "running" | "complete" | "error";

export const Tool = ({
  className,
  ...props
}: ComponentProps<typeof Collapsible>) => (
  <Collapsible
    className={cn(
      "group w-full max-w-2xl rounded-xl border bg-card",
      className,
    )}
    {...props}
  />
);

const STATUS: Record<ToolState, { label: string; icon: ReactNode }> = {
  pending: { label: "Pending", icon: <CircleDashed className="size-3.5" /> },
  running: {
    label: "Running",
    icon: <Loader2 className="size-3.5 animate-spin" />,
  },
  complete: {
    label: "Done",
    icon: <CheckCircle2 className="size-3.5 text-emerald-500" />,
  },
  error: {
    label: "Error",
    icon: <XCircle className="size-3.5 text-rose-500" />,
  },
};

export const ToolHeader = ({
  title,
  state,
  className,
  ...props
}: { title: string; state: ToolState } & ComponentProps<
  typeof CollapsibleTrigger
>) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/40",
      className,
    )}
    {...props}
  >
    <span className="flex min-w-0 items-center gap-2">
      <Wrench className="size-4 text-muted-foreground" />
      <span className="truncate text-sm font-medium">{title}</span>
    </span>
    <span className="flex shrink-0 items-center gap-2">
      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        {STATUS[state].icon}
        {STATUS[state].label}
      </span>
      <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </span>
  </CollapsibleTrigger>
);

export const ToolContent = ({
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) => (
  <CollapsibleContent
    className={cn(
      "border-t text-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
);

export const ToolSection = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="space-y-1.5 px-3.5 py-3">
    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </h4>
    {children}
  </div>
);

export const ToolJson = ({ value }: { value: unknown }) => (
  <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
    {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
  </pre>
);
