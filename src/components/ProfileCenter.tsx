"use client";

import { useState } from "react";
import type { SavedBoard } from "@/lib/local-library";
import type { SearchResultItem } from "@/lib/zhihu";

type Favlist = { urlToken: number; title: string; description: string };
type Tab = "maps" | "favorites" | "following";

/**
 * 左侧栏「个人中心」：三 tab（本机地图 / 知乎收藏夹 / 关注），
 * 与素材栏互斥展示（由 page.tsx 控制），不再纵向堆叠全部内容。
 */
export default function ProfileCenter({ name, boards, favlists, followees, busy, favlistLoading, activeFavlist, favlistItems, selectedIds, onClose, onOpenBoard, onDeleteBoard, onOpenFavlist, onToggleItem, onGenerateFavlist }: {
  name?: string;
  boards: SavedBoard[];
  favlists: Favlist[];
  followees: string[];
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
    { id: "following", label: "关注", count: followees.length },
  ];
  return (
    <section className="profile-center thin-scroll flex h-full w-80 max-w-[85vw] shrink-0 flex-col border-r border-[#e8e8e3] bg-white text-sm" data-testid="profile-center">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="min-w-0">
          <strong className="truncate text-gray-800">{name ?? "我的看山"}</strong>
          <span className="ml-2 shrink-0 text-[10px] text-amber-700">地图仅保存在此设备</span>
        </div>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">收起</button>
      </div>
      {/* tab 导航 */}
      <div className="mx-4 mb-3 mt-3 flex rounded-xl bg-[#f4f4f0] p-0.5" role="tablist" aria-label="个人中心分区">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
              tab === t.id ? "bg-white text-[#0066ff] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && <span className="ml-1 text-[10px] font-normal opacity-70">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-4 pb-4">
        {tab === "maps" && (
          <div>
            {boards.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-gray-400">生成地图后会自动加入本机历史。</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {boards.map((board) => (
                  <div key={board.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2 transition hover:border-[#0066ff]/30 hover:bg-[#fafaf7]">
                    <button onClick={() => onOpenBoard(board)} className="min-w-0 flex-1 truncate text-left text-xs text-gray-700 hover:text-[#0066ff]">{board.title}</button>
                    <time className="shrink-0 text-[9px] text-gray-400">{new Date(board.savedAt).toLocaleDateString("zh-CN")}</time>
                    <button onClick={() => onDeleteBoard(board.id)} className="shrink-0 text-[10px] text-gray-300 hover:text-red-500" aria-label={`删除${board.title}`}>删除</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "favorites" && (
          <div>
            {favlists.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-gray-400">登录后这里会展示你的知乎收藏夹。</p>
            ) : (
              <>
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {favlists.map((favlist) => (
                    <button
                      key={favlist.urlToken}
                      onClick={() => onOpenFavlist(favlist)}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] transition ${
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
                  <p className="px-1 py-4 text-center text-xs text-gray-400">正在读取收藏内容…</p>
                ) : activeFavlist ? (
                  <>
                    <div className="thin-scroll max-h-72 space-y-1 overflow-y-auto rounded-lg bg-[#fafaf7] p-1.5">
                      {favlistItems.map((item) => (
                        <label key={item.ContentID} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-white">
                          <input type="checkbox" checked={selectedIds.has(item.ContentID)} onChange={() => onToggleItem(item.ContentID)} className="mt-0.5 accent-[#0066ff]" />
                          <span className="line-clamp-2 text-xs leading-4 text-gray-600">{item.Title}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">已选 {selectedIds.size} 篇</span>
                      <div className="flex gap-2">
                        <button disabled={busy || selectedIds.size === 0} onClick={() => onGenerateFavlist("summary")} className="rounded-full bg-[#0066ff] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#0052cc] disabled:opacity-40">生成摘要</button>
                        <button disabled={busy || selectedIds.size === 0} onClick={() => onGenerateFavlist("roadmap")} className="rounded-full border border-[#0066ff]/40 px-3.5 py-1.5 text-[11px] font-medium text-[#0066ff] transition hover:bg-[#f0f5ff] disabled:opacity-40">生成路线</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="px-1 py-4 text-center text-xs text-gray-400">点上面的收藏夹，勾选内容后炼图。</p>
                )}
              </>
            )}
          </div>
        )}

        {tab === "following" && (
          <div>
            {followees.length ? (
              <div className="flex flex-wrap content-start gap-1.5">
                {followees.map((followee) => (
                  <span key={followee} className="rounded-full bg-[#f4f4f0] px-2.5 py-1 text-[10px] text-gray-600">{followee}</span>
                ))}
              </div>
            ) : (
              <p className="px-1 py-6 text-center text-xs text-gray-400">接口暂未返回关注数据。</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
