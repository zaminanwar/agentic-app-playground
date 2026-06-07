// Shared helpers for picking and rendering the agent's report files. Used by the
// artifact canvas (the hero report on `/`) and the FilesPanel (the `/chat-aui`
// workspace), so the report-selection logic stays in one place.

import { fileBasename } from "./agent-types";

// The agent writes the report as an interactive openui-lang dashboard
// (`final_report.ui`, preferred) alongside the markdown source.
export const REPORT_PATHS = ["final_report.ui", "final_report.md"];

export function isOpenUIPath(path: string): boolean {
  return path.endsWith(".ui");
}

export function isReport(path: string): boolean {
  return REPORT_PATHS.some((r) => path === r || path.endsWith(`/${r}`));
}

/** Sort: the report first, then the rest alphabetically. */
export function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    if (isReport(a) !== isReport(b)) return isReport(a) ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** Keep a selection valid as files change; prefer the openui report, then any report. */
export function pickActivePath(
  paths: string[],
  selected: string | null,
): string | null {
  if (paths.length === 0) return null;
  if (selected && paths.includes(selected)) return selected;
  return paths.find(isOpenUIPath) ?? paths.find(isReport) ?? paths[0];
}

export function downloadFile(path: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileBasename(path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
