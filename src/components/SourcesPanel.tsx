"use client";

import { useState } from "react";
import type { SearchResultItem } from "@/lib/zhihu";
import type { ViewpointGraph } from "@/lib/viewpoints";

export type HotItem = { Title: string; Url: string; ThumbnailUrl?: string; Summary?: string };

// 左栏：未生成时=知乎热榜（落地内容）；生成后=知乎素材（原始回答列表，可多选）
export default function SourcesPanel({
  items,
  graph,
  graphMode,
  hotItems,
  onPickHot,
  onGenerateSelected,
  onClose,
}: {
  items: SearchResultItem[];
  graph: ViewpointGraph | null;
  graphMode: "viewpoint" | "roadmap";
  hotItems: HotItem[];
  onPickHot: (title: string) => void;
  onGenerateSelected: (selected: SearchResultItem[], question: string) => void;
  onClose: () => void;
}) {
  const showSources = items.length > 0;
  // 生成出新素材时自动切回素材页：用户手动切热榜后重置
  const [tab, setTab] = useState<"sources" | "hot">("sources");
  const [lastItemsCount, setLastItemsCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (items.length !== lastItemsCount) {
    setLastItemsCount(items.length);
    if (items.length > 0) {
      setTab("sources");
      setSelected(new Set());
    }
  }

  const showHot = !showSources || tab === "hot";
  const selectedItems = items.filter((it) => selected.has(it.ContentID || it.Url));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[#e8e8e3] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8e3] px-4 py-3">
        {showSources ? (
          <div className="flex rounded-full border border-gray-200 bg-[#fafaf7] p-0.5 text-xs">
            {(
              [
                { id: "sources", label: "知乎回答" },
                { id: "hot", label: "知乎热榜" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-3 py-1 transition ${
                  tab === t.id ? "bg-[#0066ff] text-white" : "text-gray-500 hover:text-[#0066ff]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="text-sm font-semibold text-[#1a1a1a]">知乎热榜</h2>
        )}
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

      {/* 多选了回答：底部浮出「生成所选」操作条 */}
      {showSources && !showHot && selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#e8e8e3] bg-[#f0f5ff] px-4 py-2 text-xs">
          <span className="text-[#0066ff]">已选 {selected.size} 篇</span>
          <button
            onClick={() => onGenerateSelected(selectedItems, "")}
            className="ml-auto rounded-full bg-[#0066ff] px-3 py-1 font-medium text-white transition hover:bg-[#0052cc]"
          >
            生成所选
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-500 transition hover:bg-gray-50"
          >
            清空
          </button>
        </div>
      )}

      <div className="thin-scroll flex-1 overflow-y-auto p-3">
        {showSources && !showHot && items.length > 0 && (
          <p className="mb-2 px-1 text-[10px] leading-4 text-gray-400">
            勾选多篇回答后点「生成所选」，可只炼你自己挑的内容（不选则一键生成用全部）
          </p>
        )}
        {showHot && hotItems.length === 0 && (
          <p className="pt-16 text-center text-xs text-gray-400">热榜加载中…</p>
        )}
        {showHot &&
          hotItems.map((it, i) => (
            <button
              key={it.Url || i}
              onClick={() => onPickHot(it.Title)}
              className="group mb-2 block w-full rounded-lg border border-[#eee] p-3 text-left transition hover:border-[#0066ff]/40 hover:bg-[#f7faff]"
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
            </button>
          ))}
        {!showHot &&
          items.map((it, i) => {
            const used =
              graphMode === "viewpoint" && graph
                ? graph.viewpoints.some((v) => v.sources.includes(it.Url))
                : false;
            const key = it.ContentID || it.Url;
            const checked = selected.has(key);
            return (
              <div
                key={key || i}
                className={`group mb-2 block rounded-lg border p-3 transition ${
                  checked ? "border-[#0066ff]/60 bg-[#f0f5ff]" : "border-[#eee] hover:border-[#0066ff]/40"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(key)}
                    className="h-3.5 w-3.5 shrink-0 accent-[#0066ff]"
                    aria-label="选择这篇回答"
                  />
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
                <button onClick={() => toggle(key)} className="block w-full text-left" title="点标题也可勾选">
                  <p className="mb-1 line-clamp-2 text-xs font-medium leading-5 text-[#1a1a1a] group-hover:text-[#0066ff]">
                    {it.Title}
                  </p>
                </button>
                <p className="line-clamp-2 text-[11px] leading-4 text-gray-500">{it.ContentText}</p>
                <div className="mt-1 flex items-center gap-2">
                  <a
                    href={it.Url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[#0066ff]/70 hover:text-[#0066ff]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    查看原文
                  </a>
                  {used && (
                    <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
                      已炼入地图
                    </span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </aside>
  );
}
