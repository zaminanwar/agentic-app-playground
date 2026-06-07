"use client";

// AI-Elements-style loader/shimmer, in the spirit of the quarry but written
// against our lucide + tailwind setup (no AI SDK runtime).

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export type LoaderProps = HTMLAttributes<HTMLSpanElement> & {
  size?: number;
};

export const Loader = ({ className, size = 16, ...props }: LoaderProps) => (
  <span
    className={cn("inline-flex items-center text-muted-foreground", className)}
    {...props}
  >
    <Loader2 className="animate-spin" style={{ width: size, height: size }} />
  </span>
);

export type ShimmerProps = HTMLAttributes<HTMLSpanElement>;

/** Softly pulsing text — for "thinking…" / "researching…" labels. */
export const Shimmer = ({ className, children, ...props }: ShimmerProps) => (
  <span
    className={cn(
      "animate-pulse text-muted-foreground motion-reduce:animate-none",
      className,
    )}
    {...props}
  >
    {children}
  </span>
);
