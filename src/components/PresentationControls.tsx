"use client";

import type { LayoutKind, PaletteId } from "@/lib/harness/types";
import type { GraphLike } from "@/lib/knowledge-assets";
import { allowedLayouts, PALETTES } from "@/lib/presentation-controls";

const LAYOUT_LABELS: Record<LayoutKind, string> = {
  "debate-grid": "观点对照",
  "radial-map": "放射图",
  timeline: "时间线",
  "swimlane-roadmap": "学习泳道",
  "cluster-board": "摘要卡片",
  "evidence-tree": "证据树",
};

export default function PresentationControls({ graph, busy, onChange }: {
  graph: GraphLike;
  busy?: boolean;
  onChange: (layout: LayoutKind, palette: PaletteId) => void;
}) {
  const layouts = allowedLayouts(graph);
  const currentLayout = "presentation" in graph ? graph.presentation.layout ?? graph.kind : layouts[0];
  const currentPalette = "presentation" in graph ? graph.presentation.palette : "zhihu-blue";
  return (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-[#e8e8e3] bg-white/95 p-1.5 shadow-sm backdrop-blur" aria-label="画板呈现设置">
      <span className="px-1 text-[10px] font-semibold text-gray-400">版式</span>
      <select value={currentLayout} disabled={busy} onChange={(event) => onChange(event.target.value as LayoutKind, currentPalette)} className="rounded-lg border-0 bg-[#f6f7f4] px-2 py-1 text-xs text-gray-600 outline-none">
        {layouts.map((layout) => <option key={layout} value={layout}>{LAYOUT_LABELS[layout]}</option>)}
      </select>
      <select value={currentPalette} disabled={busy} onChange={(event) => onChange(currentLayout, event.target.value as PaletteId)} className="rounded-lg border-0 bg-[#f6f7f4] px-2 py-1 text-xs text-gray-600 outline-none">
        {PALETTES.map((palette) => <option key={palette.id} value={palette.id}>{palette.label}</option>)}
      </select>
    </div>
  );
}
