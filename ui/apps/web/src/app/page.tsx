"use client";

import React from "react";
import { RfpWorkspace } from "@/components/rfp/rfp-workspace";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { Toaster } from "@/components/ui/sonner";

export default function Page(): React.ReactNode {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <Toaster />
      <ThreadProvider>
        <StreamProvider>
          <RfpWorkspace />
        </StreamProvider>
      </ThreadProvider>
    </React.Suspense>
  );
}
