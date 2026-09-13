"use client";

import type { SourceDocument } from "@/lib/harness/types";
import { harnessStageLabel, sourceLabel } from "./HarnessStatus.helpers";

export { harnessStageLabel, sourceLabel };

export default function HarnessStatus({
  event,
  documents = [],
}: {
  event: import("@/lib/harness/types").HarnessEventType | null;
  documents?: SourceDocument[];
}) {
  if (!event) return null;
  const labels = [...new Set(documents.map((doc) => sourceLabel(doc.sourceType)))];
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#e8e8e3] bg-[#f0f5ff] px-5 py-1.5 text-xs text-[#0066ff]" role="status" aria-label={`编排阶段：${harnessStageLabel(event)}`}>
      <span className="font-medium">编排 · {harnessStageLabel(event)}</span>
      {labels.length > 0 && <span className="truncate text-[#54709f]">{labels.join(" · ")}</span>}
    </div>
  );
}
