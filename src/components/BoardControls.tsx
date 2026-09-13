"use client";

import { useState } from "react";
import type { LayoutKind, PaletteId } from "@/lib/harness/types";
import type { GraphLike } from "@/lib/knowledge-assets";
import { allowedLayouts, PALETTES } from "@/lib/presentation-controls";
import { copyText, downloadBlob, isShareCancellation, safeFilename, shareText } from "@/lib/share";
import { graphTitle } from "@/lib/knowledge-assets";

const LAYOUT_LABELS: Record<LayoutKind, string> = {
  "debate-grid": "观点对照",
  "radial-map": "放射图",
  timeline: "时间线",
  "swimlane-roadmap": "学习泳道",
  "cluster-board": "摘要卡片",
  "evidence-tree": "思维导图",
};

/**
 * 嵌入 Excalidraw renderTopRightUI 的版式/颜色控件。
 * Island 同款包装（10px 圆角 + #ecece8 边框 + 轻阴影），与画板原生 UI 协调。
 */
export function BoardPresentationControls({ graph, busy, onChange }: {
  graph: GraphLike;
  busy?: boolean;
  onChange: (layout: LayoutKind, palette: PaletteId) => void;
}) {
  const layouts = allowedLayouts(graph);
  const currentLayout = "presentation" in graph ? graph.presentation.layout ?? graph.kind : layouts[0];
  const currentPalette = "presentation" in graph ? graph.presentation.palette : "zhihu-blue";
  if (layouts.length === 0) return null;
  return (
    <div className="flex items-center gap-1" aria-label="画板呈现设置" data-testid="board-presentation">
      <select
        value={currentLayout}
        disabled={busy}
        onChange={(event) => onChange(event.target.value as LayoutKind, currentPalette)}
        className="ks-board-select h-7 rounded-lg border border-transparent bg-transparent px-2 text-xs text-gray-700 outline-none transition hover:bg-[#f4f4f0] hover:text-[#1a1a1a]"
        aria-label="版式"
      >
        {layouts.map((layout) => <option key={layout} value={layout}>{LAYOUT_LABELS[layout] ?? layout}</option>)}
      </select>
      <select
        value={currentPalette}
        disabled={busy}
        onChange={(event) => onChange(currentLayout, event.target.value as PaletteId)}
        className="ks-board-select h-7 rounded-lg border border-transparent bg-transparent px-2 text-xs text-gray-700 outline-none transition hover:bg-[#f4f4f0] hover:text-[#1a1a1a]"
        aria-label="颜色"
      >
        {PALETTES.map((palette) => <option key={palette.id} value={palette.id}>{palette.label}</option>)}
      </select>
    </div>
  );
}

/**
 * 嵌入 Excalidraw 的两个操作按钮：一键分享至知乎 + 保存图片。
 */
export function BoardShareButtons({ graph, makePng }: { graph: GraphLike; makePng: () => Promise<Blob> }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const show = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 2500);
  };
  const shareToZhihu = async () => {
    const text = shareText(graph);
    try {
      if (navigator.share) {
        await navigator.share({ title: graphTitle(graph), text });
        show("已打开系统分享");
        return;
      }
      throw new Error("unsupported");
    } catch (error) {
      if (isShareCancellation(error)) { show("已取消分享"); return; }
      // 浏览器不支持系统分享：复制文案降级，用户可粘贴到知乎
      try {
        await copyText(text);
        show("分享文案已复制，去知乎粘贴即可");
      } catch {
        show("复制失败，请重试");
      }
    }
  };
  const saveImage = async () => {
    setSaving(true);
    try {
      const blob = await makePng();
      downloadBlob(blob, safeFilename(graphTitle(graph)));
      show("图片已保存");
    } catch {
      show("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5" data-testid="board-share">
      {notice && <span className="rounded-full bg-[#1a1a1a]/85 px-2.5 py-1 text-[11px] text-white shadow-sm" role="status">{notice}</span>}
      <button
        onClick={saveImage}
        disabled={saving}
        className="flex h-7 items-center gap-1 rounded-[10px] px-2.5 text-xs text-gray-700 transition hover:bg-[#f4f4f0] hover:text-[#1a1a1a] disabled:opacity-50"
        title="保存为 PNG 图片（带来源水印）"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        {saving ? "保存中…" : "保存图片"}
      </button>
      <button
        onClick={shareToZhihu}
        className="flex h-7 items-center gap-1 rounded-[10px] bg-[#0066ff] px-3 text-xs font-medium text-white shadow-[0_1px_3px_rgb(0_102_255/0.35)] transition hover:bg-[#0052cc]"
        title="复制分享文案并打开系统分享"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
        </svg>
        一键分享至知乎
      </button>
    </div>
  );
}
