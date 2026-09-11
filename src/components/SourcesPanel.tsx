"use client";

import type { SearchResultItem } from "@/lib/zhihu";
import type { ViewpointGraph } from "@/lib/viewpoints";

export type HotItem = { Title: string; Url: string; ThumbnailUrl?: string; Summary?: string };

// 左栏：未生成时=知乎热榜（落地内容）；生成后=知乎素材（原始回答列表）
export default function SourcesPanel({
  items,
  graph,
  graphMode,
  hotItems,
  onPickHot,
  onClose,
}: {
  items: SearchResultItem[];
  graph: ViewpointGraph | null;
  graphMode: "viewpoint" | "roadmap";
  hotItems: HotItem[];
  onPickHot: (title: string) => void;
  onClose: () => void;
}) {
  const showSources = items.length > 0;

  return (
    <aside className="flex h-full w-72 flex-col border-r border-[#e8e8e3] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8e3] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#1a1a1a]">{showSources ? "知乎素材" : "知乎热榜"}</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="收起面板"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto p-3">
        {!showSources && hotItems.length === 0 && (
          <p className="pt-16 text-center text-xs text-gray-400">热榜加载中…</p>
        )}
        {!showSources &&
          hotItems.map((it, i) => (
            <button
              key={it.Url || i}
              onClick={() => onPickHot(it.Title)}
              className="group mb-2 block w-full rounded-lg border border-[#eee] p-3 text-left transition hover:border-[#0066ff]/40 hover:shadow-sm"
              title="点击生成这张观点对照图"
            >
              <div className="mb-1 flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 text-xs font-bold ${i < 3 ? "text-[#ff4d4f]" : "text-gray-300"}`}
                >
                  {i + 1}
                </span>
                <p className="line-clamp-2 text-xs font-medium leading-5 text-[#1a1a1a] group-hover:text-[#0066ff]">
                  {it.Title}
                </p>
              </div>
              {it.Summary && <p className="line-clamp-2 pl-5 text-[11px] leading-4 text-gray-500">{it.Summary}</p>}
              <span className="mt-1.5 hidden pl-5 text-[10px] text-[#0066ff] group-hover:inline">一键看山 →</span>
            </button>
          ))}
        {showSources &&
          items.map((it, i) => {
            const used =
              graphMode === "viewpoint" && graph
                ? graph.viewpoints.some((v) => v.sources.includes(it.Url))
                : false;
            return (
              <a
                key={it.ContentID || i}
                href={it.Url}
                target="_blank"
                rel="noreferrer"
                className="group mb-2 block rounded-lg border border-[#eee] p-3 transition hover:border-[#0066ff]/40 hover:shadow-sm"
              >
                <div className="mb-1 flex items-center gap-2">
                  {it.AuthorAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.AuthorAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0f5ff] text-[10px] font-medium text-[#0066ff]">
                      {i + 1}
                    </span>
                  )}
                  <span className="truncate text-xs font-medium text-[#1a1a1a]">{it.AuthorName}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-gray-400">▲ {it.VoteUpCount}</span>
                </div>
                <p className="mb-1 line-clamp-2 text-xs font-medium leading-5 text-[#1a1a1a] group-hover:text-[#0066ff]">
                  {it.Title}
                </p>
                <p className="line-clamp-2 text-[11px] leading-4 text-gray-500">{it.ContentText}</p>
                {used && (
                  <span className="mt-1.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
                    已炼入地图
                  </span>
                )}
              </a>
            );
          })}
      </div>
    </aside>
  );
}
