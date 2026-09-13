import type { KnowledgeGraph, LayoutKind, PaletteId } from "./harness/types.ts";
import type { GraphLike } from "./knowledge-assets.ts";
import { normalizeAgentGraph } from "./graph-contract.ts";

export const PALETTES: { id: PaletteId; label: string }[] = [
  { id: "zhihu-blue", label: "知乎蓝" },
  { id: "paper-pastel", label: "纸张粉彩" },
  { id: "research-mono", label: "研究灰" },
  { id: "poster-bold", label: "海报色" },
  { id: "nature-notes", label: "自然笔记" },
];

export function allowedLayouts(graph: GraphLike): LayoutKind[] {
  if ("stages" in graph) return ["swimlane-roadmap", "timeline"];
  if ("question" in graph) return ["debate-grid", "cluster-board", "radial-map"];
  return [...new Set<LayoutKind>([graph.kind, "cluster-board", "radial-map", "evidence-tree"])];
}

export function applyPresentation(graph: GraphLike, layout: LayoutKind, palette: PaletteId): KnowledgeGraph {
  const normalized = normalizeAgentGraph(graph);
  if (!normalized) throw new Error("不支持的图数据");
  if (!allowedLayouts(graph).includes(layout)) throw new Error("该图不支持这个布局");
  return { ...normalized, kind: layout, presentation: { ...normalized.presentation, layout, palette } };
}
