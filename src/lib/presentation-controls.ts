import type { KnowledgeGraph, PaletteId } from "./harness/types.ts";
import type { GraphLike } from "./knowledge-assets.ts";
import { normalizeAgentGraph } from "./graph-contract.ts";

export const PALETTES: { id: PaletteId; label: string }[] = [
  { id: "zhihu-blue", label: "知乎蓝" },
  { id: "paper-pastel", label: "纸张粉彩" },
  { id: "research-mono", label: "研究灰" },
  { id: "poster-bold", label: "海报色" },
  { id: "nature-notes", label: "自然笔记" },
];

/**
 * 只切换调色板；版式（layout）由生成时的图类型决定，不再提供运行时切换
 * （运行时布局切换在多种图类型上渲染不稳定，已按用户要求移除该控件）。
 */
export function applyPalette(graph: GraphLike, palette: PaletteId): KnowledgeGraph {
  const normalized = normalizeAgentGraph(graph);
  if (!normalized) throw new Error("不支持的图数据");
  const layout = normalized.presentation.layout ?? normalized.kind;
  return { ...normalized, presentation: { ...normalized.presentation, layout, palette } };
}
