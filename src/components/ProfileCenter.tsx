"use client";

import type { SavedBoard } from "@/lib/local-library";
import type { SearchResultItem } from "@/lib/zhihu";

type Favlist = { urlToken: number; title: string; description: string };

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
  return (
    <section className="profile-center thin-scroll shrink-0 overflow-y-auto border-b border-[#e8e8e3] bg-white px-5 py-3 text-sm" data-testid="profile-center">
      <div className="mb-3 flex items-center justify-between">
        <div><strong className="text-gray-800">{name ?? "我的看山"}</strong><span className="ml-2 text-[10px] text-amber-700">地图仅保存在此设备</span></div>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">收起</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.5fr_.8fr]">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-600">本机地图 · {boards.length}</h3>
          {boards.length === 0 ? <p className="text-xs text-gray-400">生成地图后会自动加入本机历史。</p> : <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {boards.map((board) => <div key={board.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <button onClick={() => onOpenBoard(board)} className="min-w-0 flex-1 truncate text-left text-xs text-gray-700 hover:text-[#0066ff]">{board.title}</button>
              <time className="shrink-0 text-[9px] text-gray-400">{new Date(board.savedAt).toLocaleDateString("zh-CN")}</time>
              <button onClick={() => onDeleteBoard(board.id)} className="text-[10px] text-gray-300 hover:text-red-500" aria-label={`删除${board.title}`}>删除</button>
            </div>)}
          </div>}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-600">知乎收藏夹 · 选择内容炼图</h3>
          <div className="mb-2 flex gap-1 overflow-x-auto">
            {favlists.map((favlist) => <button key={favlist.urlToken} onClick={() => onOpenFavlist(favlist)} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${activeFavlist?.urlToken === favlist.urlToken ? "border-[#0066ff] bg-[#f0f5ff] text-[#0066ff]" : "border-gray-200 text-gray-500"}`}>{favlist.title}</button>)}
          </div>
          {favlistLoading ? <p className="text-xs text-gray-400">正在读取收藏内容…</p> : activeFavlist && <>
            <div className="thin-scroll max-h-28 space-y-1 overflow-y-auto">
              {favlistItems.map((item) => <label key={item.ContentID} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-[#fafaf7]">
                <input type="checkbox" checked={selectedIds.has(item.ContentID)} onChange={() => onToggleItem(item.ContentID)} className="mt-0.5 accent-[#0066ff]" />
                <span className="line-clamp-1 text-xs text-gray-600">{item.Title}</span>
              </label>)}
            </div>
            <div className="mt-2 flex items-center gap-2"><span className="text-[10px] text-gray-400">已选 {selectedIds.size} 篇</span><button disabled={busy || selectedIds.size === 0} onClick={() => onGenerateFavlist("summary")} className="rounded-full bg-[#0066ff] px-3 py-1 text-[10px] text-white disabled:opacity-40">生成摘要</button><button disabled={busy || selectedIds.size === 0} onClick={() => onGenerateFavlist("roadmap")} className="rounded-full border border-[#0066ff]/40 px-3 py-1 text-[10px] text-[#0066ff] disabled:opacity-40">生成路线</button></div>
          </>}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-600">实际关注 · {followees.length}</h3>
          {followees.length ? <div className="flex max-h-40 flex-wrap content-start gap-1 overflow-y-auto">{followees.map((name) => <span key={name} className="rounded-full bg-[#f4f4f0] px-2 py-1 text-[10px] text-gray-600">{name}</span>)}</div> : <p className="text-xs text-gray-400">接口暂未返回关注数据。</p>}
        </div>
      </div>
    </section>
  );
}
