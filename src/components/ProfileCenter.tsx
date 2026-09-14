"use client";

import { useState } from "react";
import type { SavedBoard } from "@/lib/local-library";
import type { SearchResultItem } from "@/lib/zhihu";

type Favlist = { urlToken: number; title: string; description: string };
type Tab = "maps" | "favorites";

function EmptyState({ icon, hint, sub }: { icon: string; hint: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
      <svg className="h-6 w-6 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d={icon} />
      </svg>
      <p className="text-xs text-gray-500">{hint}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

/**
 * 左侧栏「个人中心」：两 tab（本机地图 / 知乎收藏夹），
 * 与素材栏互斥展示（由 page.tsx 控制），tab 样式与素材栏同款胶囊。
 */
export default function ProfileCenter({ name, boards, favlists, busy, favlistLoading, activeFavlist, favlistItems, selectedIds, onClose, onOpenBoard, onDeleteBoard, onOpenFavlist, onToggleItem, onGenerateFavlist }: {
  name?: string;
  boards: SavedBoard[];
  favlists: Favlist[];
  busy: boolean;
  favlistLoading: boolean;
  activeFavlist: Favlist | null;
  favlistItems: SearchResultItem[];
  selectedIds: Set<string>;
  onClose: () => void;
  onOpenBoard: (board: SavedBoard) => void;
  onDeleteBoard: (id: string) => void;
  onOpenFavlist: (favlist: Favlist) => void;
  onToggleItem: (id: string) => void;
  onGenerateFavlist: (mode: "roadmap" | "summary") => void;
}) {
  const [tab, setTab] = useState<Tab>("maps");
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "maps", label: "地图", count: boards.length },
    { id: "favorites", label: "收藏夹", count: favlists.length },
  ];
  return (
    <section className="profile-center thin-scroll flex h-full w-80 max-w-[85vw] shrink-0 flex-col border-r border-[#e8e8e3] bg-white text-sm" data-testid="profile-center">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex min-w-0 items-baseline">
          <strong className="truncate text-gray-800">{name ?? "我的看山"}</strong>
          <span className="ml-2 shrink-0 text-[11px] text-gray-400">仅保存在此设备</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="收起面板">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
      {/* tab 导航：与素材栏同款胶囊分段 */}
      <div className="mx-4 mb-3 mt-3 flex rounded-full border border-gray-200 bg-[#fafaf7] p-0.5 text-xs" role="tablist" aria-label="个人中心分区">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full px-2 py-1 transition ${
              tab === t.id ? "bg-[#0066ff] text-white" : "text-gray-500 hover:text-[#0066ff]"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className={`ml-1 text-[10px] font-normal ${tab === t.id ? "text-white/75" : "text-gray-400"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-4 pb-4">
        {tab === "maps" && (
          <div>
            {boards.length === 0 ? (
              <EmptyState icon="M9 187l6-6-6-6M21 12a9 9 0 01-9 9 9 9 0 01-9-9 9 9 0 0118 0z" hint="生成地图后会自动加入本机历史" sub="在上方输入问题，点击一键看山" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {boards.map((board) => (
                  <div key={board.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2 transition hover:border-[#0066ff]/30 hover:bg-[#fafaf7]">
                    <button onClick={() => onOpenBoard(board)} className="min-w-0 flex-1 truncate text-left text-xs text-gray-700 hover:text-[#0066ff]" title={board.title}>{board.title}</button>
                    <time className="shrink-0 text-[10px] text-gray-400" title={new Date(board.savedAt).toLocaleString("zh-CN")}>{new Date(board.savedAt).toLocaleDateString("zh-CN")}</time>
                    <button onClick={() => onDeleteBoard(board.id)} className="shrink-0 text-[10px] text-gray-400 hover:text-red-500" aria-label={`删除${board.title}`}>删除</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "favorites" && (
          <div>
            {favlists.length === 0 ? (
              <EmptyState icon="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" hint="登录后这里会展示你的知乎收藏夹" />
            ) : (
              <>
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {favlists.map((favlist) => (
                    <button
                      key={favlist.urlToken}
                      onClick={() => onOpenFavlist(favlist)}
                      title={favlist.title}
                      className={`max-w-[10.5rem] shrink-0 truncate rounded-full border px-2.5 py-1 text-[10px] transition ${
                        activeFavlist?.urlToken === favlist.urlToken
                          ? "border-[#0066ff] bg-[#f0f5ff] text-[#0066ff]"
                          : "border-gray-200 text-gray-500 hover:border-[#0066ff]/40 hover:text-[#0066ff]"
                      }`}
                    >
                      {favlist.title}
                    </button>
                  ))}
                </div>
                {favlistLoading ? (
                  <p className="px-1 py-4 text-center text-xs text-gray-500">正在读取收藏内容…</p>
                ) : activeFavlist ? (
                  <>
                    <div className="thin-scroll">
                      {favlistItems.map((item, i) => {
                        const checked = selectedIds.has(item.ContentID);
                        return (
                          <div
                            key={item.ContentID}
                            className={`group mb-2 rounded-lg border p-2.5 transition ${
                              checked ? "border-[#0066ff]/60 bg-[#f0f5ff]" : "border-[#eee] hover:border-[#0066ff]/40"
                            }`}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggleItem(item.ContentID)}
                                className="h-3.5 w-3.5 shrink-0 accent-[#0066ff]"
                                aria-label="选择这篇内容"
                              />
                              {item.AuthorAvatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.AuthorAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                              ) : (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0f5ff] text-[10px] font-medium text-[#0066ff]">
                                  {i + 1}
                                </span>
                              )}
                              <span className="truncate text-xs font-medium text-[#1a1a1a]">{item.AuthorName}</span>
                              <span className="ml-auto shrink-0 text-[10px] text-gray-400">▲ {item.VoteUpCount}</span>
                            </div>
                            <button onClick={() => onToggleItem(item.ContentID)} className="block w-full text-left" title="点标题也可勾选">
                              <p className="mb-1 line-clamp-2 text-xs font-medium leading-5 text-[#1a1a1a] group-hover:text-[#0066ff]">
                                {item.Title}
                              </p>
                            </button>
                            <p className="line-clamp-2 text-[11px] leading-4 text-gray-500">{item.ContentText}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <a
                                href={item.Url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-[#0066ff]/70 hover:text-[#0066ff]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                查看原文
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="shrink-0 text-[11px] text-gray-500">已选 {selectedIds.size} 篇</span>
                      <div className="flex gap-1.5">
                        <button disabled={busy || selectedIds.size === 0} onClick={() => onGenerateFavlist("summary")} className="rounded-full bg-[#0066ff] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#0052cc] disabled:opacity-40">生成摘要</button>
                        <button disabled={busy || selectedIds.size === 0} onClick={() => onGenerateFavlist("roadmap")} className="rounded-full border border-[#0066ff]/40 px-3 py-1.5 text-xs font-medium text-[#0066ff] transition hover:bg-[#f0f5ff] disabled:opacity-40">生成路线</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState icon="M4 6h16M4 12h10M4 18h7" hint="点上面的收藏夹，勾选内容后炼图" />
                )}
              </>
            )}
          </div>
        )}

      </div>
    </section>
  );
}
