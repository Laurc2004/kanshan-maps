"use client";

import { useState } from "react";
import type { GraphLike } from "@/lib/knowledge-assets";
import { graphTitle } from "@/lib/knowledge-assets";
import { copyText, downloadBlob, isShareCancellation, safeFilename, shareText } from "@/lib/share";

export default function SharePanel({ graph, makePng }: { graph: GraphLike; makePng: () => Promise<Blob> }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (action: "copy" | "download" | "share") => {
    try {
      const text = shareText(graph);
      if (action === "copy") { await copyText(text); setNotice("文案已复制"); return; }
      const blob = await makePng();
      if (action === "download") { downloadBlob(blob, safeFilename(graphTitle(graph))); setNotice("图片已保存"); return; }
      const file = new File([blob], safeFilename(graphTitle(graph)), { type: "image/png" });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) throw new Error("unsupported");
      await navigator.share({ title: graphTitle(graph), text, files: [file] });
      setNotice("已打开系统分享");
    } catch (error) {
      if (isShareCancellation(error)) { setNotice("已取消分享"); return; }
      if (action === "share") { setNotice("当前浏览器不支持文件分享，请使用保存图片或复制文案"); return; }
      setNotice("操作失败，请重试");
    }
  };
  return <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-xl border border-[#e8e8e3] bg-white/95 p-1.5 shadow-sm backdrop-blur">
    <button onClick={() => setOpen((value) => !value)} className="rounded-lg bg-[#0066ff] px-2.5 py-1.5 text-xs font-medium text-white">分享知乎</button>
    {open && <>
      <button onClick={() => run("download")} className="rounded-lg px-2 py-1.5 text-xs text-gray-600 hover:bg-[#f0f5ff]">保存图片</button>
      <button onClick={() => run("copy")} className="rounded-lg px-2 py-1.5 text-xs text-gray-600 hover:bg-[#f0f5ff]">复制文案</button>
      <button onClick={() => run("share")} className="rounded-lg px-2 py-1.5 text-xs text-[#0066ff] hover:bg-[#f0f5ff]">系统分享</button>
    </>}
    {notice && <span className="max-w-48 truncate px-1 text-[10px] text-gray-400" role="status">{notice}</span>}
  </div>;
}
