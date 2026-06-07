"use client";

// Ported from Vercel AI Elements (`sources`), Apache-2.0. AI Elements is the
// "owned component quarry" — we copy the presentational source rather than run
// the CLI (which pulls the Vercel AI SDK runtime), and feed it our own data.
// See https://elements.ai-sdk.dev/components/sources.

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

export type SourcesProps = ComponentProps<"div">;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible
    className={cn("not-prose text-primary text-xs", className)}
    {...props}
  />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "group flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-3.5" />
        <span>
          {count} source{count === 1 ? "" : "s"}
        </span>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-2.5 flex flex-col gap-2",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a"> & {
  /** Optional secondary line (e.g. hostname) shown under the title. */
  hostname?: string;
};

export const Source = ({
  href,
  title,
  hostname,
  children,
  ...props
}: SourceProps) => (
  <a
    className="flex items-start gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{title}</span>
          {hostname && (
            <span className="truncate text-[11px] text-muted-foreground">
              {hostname}
            </span>
          )}
        </span>
      </>
    )}
  </a>
);
