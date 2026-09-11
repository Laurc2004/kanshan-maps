"use client";

import type { SearchResultItem } from "@/lib/zhihu";
import type { ViewpointGraph } from "@/lib/viewpoints";

// 左栏：知乎原始素材上下文（搜到的回答列表，可点回原帖）
export default function SourcesPanel({
  items,
  graph,
  onClose,
}: {
  items: SearchResultItem[];
  graph: ViewpointGraph | null;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full w-72 flex-col border-r border-[#e8e8e3] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8e3] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#1a1a1a]">知乎素材</h2>
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
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/liukanshan/sway.gif" alt="刘看山" className="h-20 w-20" />
            <p className="text-xs leading-5 text-gray-400">
              生成一张图后，
              <br />
              这里会列出参考的知乎回答
            </p>
          </div>
        )}
        {items.map((it, i) => {
          const used = graph?.viewpoints.some((v) => v.sources.includes(it.Url)) ?? false;
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
