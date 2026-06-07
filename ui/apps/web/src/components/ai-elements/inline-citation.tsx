"use client";

// Inline citation marker, in the spirit of AI Elements' inline-citation but
// adapted to our data: the agent cites claims as numbered Markdown links
// (`[1](url)`); the markdown renderer routes those to this superscript pill with
// a hover preview. Built on our existing Tooltip — no new deps, no AI SDK.

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function InlineCitation({
  index,
  href,
  title,
  className,
}: {
  index: string | number;
  href: string;
  title?: string;
  className?: string;
}) {
  const host = hostnameOf(href);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "mx-0.5 inline-flex items-center rounded-[4px] bg-primary/10 px-1 align-super text-[0.65em] font-semibold leading-none text-primary no-underline tabular-nums transition-colors hover:bg-primary/20",
              className,
            )}
          >
            {index}
          </a>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs font-medium">{title ?? host}</p>
          {title && <p className="text-[11px] text-muted-foreground">{host}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** True when a link's text is just a citation number (e.g. "1" or "[1]"). */
export function citationIndex(children: unknown): string | null {
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children) &&
          children.length === 1 &&
          typeof children[0] === "string"
        ? children[0]
        : null;
  const m = text?.trim().match(/^\[?(\d{1,3})\]?$/);
  return m ? m[1] : null;
}
