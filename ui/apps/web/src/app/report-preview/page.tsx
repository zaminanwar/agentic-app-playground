"use client";

// SPIKE route — /report-preview. The OpenUI <Renderer> is client-only (it
// touches `document` at render), so we load it with ssr:false to keep it out of
// Next's server prerender.

import dynamic from "next/dynamic";

const OpenUIReport = dynamic(() => import("./openui-report"), { ssr: false });

export default function ReportPreviewPage() {
  return <OpenUIReport />;
}
