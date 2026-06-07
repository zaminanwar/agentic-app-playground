/**
 * Pull the cited sources out of a report's markdown so they can be surfaced as
 * a dedicated Sources panel. The deep-research agent writes its citations as
 * markdown links (and occasionally bare URLs) in `final_report.md`; there is no
 * structured `sources` channel in graph state yet, so we derive them here.
 *
 * A backend `sources` channel would be cleaner long-term, but this keeps the
 * Sources UI a pure frontend addition with no agent change.
 */

export interface ExtractedSource {
  url: string;
  title: string;
  hostname: string;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function extractSources(
  markdown: string | undefined | null,
): ExtractedSource[] {
  if (!markdown) return [];
  const byUrl = new Map<string, ExtractedSource>();

  const add = (url: string, title?: string) => {
    // Trim trailing punctuation that commonly clings to URLs in prose.
    const clean = url.replace(/[.,;:'")\]]+$/, "");
    if (!byUrl.has(clean)) {
      const host = hostnameOf(clean);
      byUrl.set(clean, {
        url: clean,
        title: title?.trim() || host,
        hostname: host,
      });
    }
  };

  // Markdown links first — they carry a human title: [title](https://…)
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(markdown)) !== null) {
    add(m[2], m[1]);
  }

  // Then any remaining bare URLs (dedup guards against re-adding linked ones).
  const bareRe = /\bhttps?:\/\/[^\s)\]]+/g;
  while ((m = bareRe.exec(markdown)) !== null) {
    add(m[0]);
  }

  return [...byUrl.values()];
}
