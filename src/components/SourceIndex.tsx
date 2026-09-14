"use client";

import type { KnowledgeSource } from "@/lib/knowledge-assets";

export default function SourceIndex({ sources }: { sources: KnowledgeSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="absolute bottom-3 left-3 z-10 max-w-[min(62vw,calc(100%-16rem))] rounded-[12px] border border-[#e8e8e3] bg-white/95 px-3 py-2 shadow-sm backdrop-blur" data-testid="source-index">
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-gray-500">来源索引 · 知乎 {sources.length} 篇</div>
      <div className="thin-scroll flex max-w-full gap-2 overflow-x-auto pb-0.5">
        {sources.map((source, index) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-48 shrink-0 truncate rounded-full border border-[#dfe7f7] bg-[#f7faff] px-2.5 py-1 text-[10px] text-[#31547f] hover:border-[#0066ff] hover:text-[#0066ff]"
            title={`${source.title} · ${source.author}`}
          >
            [{index + 1}] {source.title}
          </a>
        ))}
      </div>
    </div>
  );
}
