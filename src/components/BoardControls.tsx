"use client";

import { useEffect, useRef, useState } from "react";
import type { PaletteId } from "@/lib/harness/types";
import type { GraphLike } from "@/lib/knowledge-assets";
import { PALETTES } from "@/lib/presentation-controls";
import { downloadBlob, safeFilename } from "@/lib/share";
import { graphTitle } from "@/lib/knowledge-assets";

/**
 * 自定义下拉（非原生 select）：调色板选择器。
 * 点击外部关闭；键盘 Esc 关闭。
 */
function PaletteDropdown({ value, onChange }: { value: PaletteId; onChange: (palette: PaletteId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = PALETTES.find((p) => p.id === value) ?? PALETTES[0];
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" data-testid="palette-dropdown">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="切换画板配色"
        className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-gray-700 transition hover:bg-[#f4f4f0] hover:text-[#1a1a1a]"
      >
        <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: PALETTE_SWATCH[value] ?? "#e7f5ff" }} aria-hidden="true" />
        <span>{current.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className={open ? "rotate-180 transition-transform" : "transition-transform"}>
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" aria-label="配色" className="absolute bottom-9 right-0 z-50 min-w-32 overflow-hidden rounded-[10px] border border-[#ecece8] bg-white py-1 shadow-[0_4px_16px_rgb(0_0_0/0.08)]">
          {PALETTES.map((palette) => (
            <li key={palette.id}>
              <button
                role="option"
                aria-selected={palette.id === value}
                onClick={() => { onChange(palette.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                  palette.id === value ? "bg-[#f0f5ff] text-[#0066ff]" : "text-gray-700 hover:bg-[#fafaf7]"
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: PALETTE_SWATCH[palette.id] ?? "#e7f5ff" }} aria-hidden="true" />
                <span className="flex-1">{palette.label}</span>
                {palette.id === value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 每个调色板的取色预览（与其 fills 首色一致，见 harness/presentation.ts） */
const PALETTE_SWATCH: Record<PaletteId, string> = {
  "zhihu-blue": "#e7f5ff",
  "paper-pastel": "#fcefe8",
  "research-mono": "#f1f3f5",
  "poster-bold": "#ffd43b",
  "nature-notes": "#e9f5db",
};

/**
 * 画板控件：配色下拉 + 保存图片。
 * 由 page.tsx 以绝对定位悬浮在画板右下角（bottom-3 right-3）。
 * notice 提示条绝对定位浮在控件上方，不挤占按钮空间、不会造成文字堆叠。
 */
export function BoardControls({ graph, busy, makePng, onPaletteChange }: {
  graph: GraphLike;
  busy?: boolean;
  makePng: () => Promise<Blob>;
  onPaletteChange: (palette: PaletteId) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const show = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 2500);
  };
  const currentPalette: PaletteId = "presentation" in graph ? graph.presentation.palette : "zhihu-blue";
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
    <div className="ks-board-ui relative flex items-center gap-1 rounded-[10px] border border-[#ecece8] bg-white p-1 shadow-[0_2px_10px_rgb(0_0_0/0.05)]" data-testid="board-controls-ui">
      {notice && (
        <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-full bg-[#1a1a1a]/85 px-2.5 py-1 text-[11px] text-white shadow-sm" role="status">
          {notice}
        </span>
      )}
      <PaletteDropdown value={currentPalette} onChange={onPaletteChange} />
      <span className="h-4 w-px bg-[#ecece8]" aria-hidden="true" />
      <button
        onClick={saveImage}
        disabled={saving || busy}
        className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[10px] px-2.5 text-xs text-gray-700 transition hover:bg-[#f4f4f0] hover:text-[#1a1a1a] disabled:opacity-50"
        title="保存为 PNG 图片（带来源水印）"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        {saving ? "保存中…" : "保存图片"}
      </button>
    </div>
  );
}
