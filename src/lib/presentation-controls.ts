import type { KnowledgeGraph, PaletteId } from "./harness/types.ts";
import type { GraphLike } from "./knowledge-assets.ts";
import { normalizeAgentGraph } from "./graph-contract.ts";
import { PALETTE_TOKENS, type PaletteTokens } from "./harness/presentation.ts";

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

// ── 换色不重渲染：直接在场景元素上按颜色值映射 ──────────────────
// 换色的语义就是「只改颜色」。重渲染会切换渲染器/重排元素 id，用户看到的结构整个变掉。
// 这里收集所有调色板（含 legacy 渲染器的四套 style）出现过的颜色 → 建立「任意已知颜色 →
// 其在所属色板中的角色 → 目标色板同角色颜色」的映射，逐元素改 backgroundColor/strokeColor。
// 未知颜色（用户手动画的元素、白色节点卡）保持原样。

type LegacyStyleTokens = { fills: string[]; strokes: string[]; consensusFill: string; consensusStroke: string; title: string; muted: string };
// legacy 渲染器（excalidraw-layout.ts）的四套 style 色板，与源码保持一致
const LEGACY_STYLES: LegacyStyleTokens[] = [
  { fills: ["#e7f5ff", "#f3f0ff", "#fff4e6", "#ffe3e3"], strokes: ["#339af0", "#845ef7", "#f76707", "#e03131"], consensusFill: "#ebfbee", consensusStroke: "#40c057", title: "#1a1a1a", muted: "#757575" },
  { fills: ["#f1f3f5", "#e9ecef", "#dee2e6", "#ced4da"], strokes: ["#343a40", "#495057", "#343a40", "#495057"], consensusFill: "#f1f3f5", consensusStroke: "#495057", title: "#212529", muted: "#868e96" },
  { fills: ["#e8f7ff", "#fff0f6", "#fff9db", "#ebfbee"], strokes: ["#74c0fc", "#f783ac", "#fcc419", "#69db7c"], consensusFill: "#ebfbee", consensusStroke: "#69db7c", title: "#343a40", muted: "#868e96" },
  { fills: ["#d0ebff", "#e5dbff", "#ffe8cc", "#ffc9c9"], strokes: ["#1971c2", "#6741d9", "#d9480f", "#c92a2a"], consensusFill: "#d3f9d8", consensusStroke: "#2f9e44", title: "#212529", muted: "#495057" },
];
// legacy style 索引 → 对应的统一色板（换色目标只能是五套 PaletteId）
const LEGACY_TO_PALETTE: PaletteId[] = ["zhihu-blue", "research-mono", "paper-pastel", "poster-bold"];

type ColorRole =
  | { kind: "fill"; index: number }
  | { kind: "stroke"; index: number }
  | { kind: "accentFill" }
  | { kind: "accentStroke" }
  | { kind: "title" }
  | { kind: "body" }
  | { kind: "muted" };

function paletteRoleMap(): Map<string, { source: PaletteId; role: ColorRole }> {
  const map = new Map<string, { source: PaletteId; role: ColorRole }>();
  const put = (color: string, source: PaletteId, role: ColorRole) => {
    const key = color.toLowerCase();
    if (!map.has(key)) map.set(key, { source, role });
  };
  for (const [id, tokens] of Object.entries(PALETTE_TOKENS) as [PaletteId, PaletteTokens][]) {
    tokens.fills.forEach((c, i) => put(c, id, { kind: "fill", index: i }));
    tokens.strokes.forEach((c, i) => put(c, id, { kind: "stroke", index: i }));
    put(tokens.accentFill, id, { kind: "accentFill" });
    put(tokens.accentStroke, id, { kind: "accentStroke" });
    put(tokens.title, id, { kind: "title" });
    put(tokens.body, id, { kind: "body" });
    put(tokens.muted, id, { kind: "muted" });
  }
  // legacy 色板：fills[i]/strokes[i] 映射到统一色板同 index；consensus* → accent*；title/muted 同名
  LEGACY_STYLES.forEach((style, si) => {
    const id = LEGACY_TO_PALETTE[si];
    style.fills.forEach((c, i) => put(c, id, { kind: "fill", index: i }));
    style.strokes.forEach((c, i) => put(c, id, { kind: "stroke", index: i }));
    put(style.consensusFill, id, { kind: "accentFill" });
    put(style.consensusStroke, id, { kind: "accentStroke" });
    put(style.title, id, { kind: "title" });
    put(style.muted, id, { kind: "muted" });
  });
  return map;
}

function roleColor(target: PaletteTokens, role: ColorRole): string {
  switch (role.kind) {
    case "fill": return target.fills[role.index % target.fills.length];
    case "stroke": return target.strokes[role.index % target.strokes.length];
    case "accentFill": return target.accentFill;
    case "accentStroke": return target.accentStroke;
    case "title": return target.title;
    case "body": return target.body;
    case "muted": return target.muted;
  }
}

/**
 * 把场景元素从当前色板重着色到目标色板：只改 backgroundColor/strokeColor，
 * 元素 id、坐标、尺寸、文字、z 序全部原样保留（用户手动排版不受影响）。
 * 返回新数组；未命中任何已知色板颜色的元素原样拷贝。
 */
export function recolorElements<T extends Record<string, unknown>>(elements: readonly T[], palette: PaletteId): T[] {
  const target = PALETTE_TOKENS[palette] ?? PALETTE_TOKENS["zhihu-blue"];
  const roles = paletteRoleMap();
  const remap = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const hit = roles.get(value.toLowerCase());
    return hit ? roleColor(target, hit.role) : undefined;
  };
  return elements.map((el) => {
    const bg = remap(el.backgroundColor);
    const stroke = remap(el.strokeColor);
    if (bg === undefined && stroke === undefined) return el;
    return { ...el, ...(bg !== undefined ? { backgroundColor: bg } : {}), ...(stroke !== undefined ? { strokeColor: stroke } : {}) };
  });
}
