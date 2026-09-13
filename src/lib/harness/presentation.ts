import type { KnowledgeGraph, LayoutKind, PaletteId, PresentationSpec, RunPlan } from "./types.ts";

export interface PaletteTokens {
  fills: readonly string[];
  strokes: readonly string[];
  title: string;
  body: string;
  muted: string;
  accentFill: string;
  accentStroke: string;
}

export interface PresentationTokens {
  palette: PaletteTokens;
  spacing: number;
  cardScale: number;
  roughness: number;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed";
  titleSize: number;
  keyFindingSize: number;
  evidenceSize: number;
}

const PALETTES: Record<PaletteId, PaletteTokens> = {
  "zhihu-blue": { fills: ["#e7f5ff", "#fff4e6", "#ebfbee", "#f3f0ff"], strokes: ["#1971c2", "#e8590c", "#2b8a3e", "#6741d9"], title: "#1a1a1a", body: "#343a40", muted: "#757575", accentFill: "#fff3bf", accentStroke: "#e67700" },
  "paper-pastel": { fills: ["#fcefe8", "#e8f3ef", "#edf0fa", "#fff7d6"], strokes: ["#b5654d", "#4f8173", "#6077a8", "#9b7b25"], title: "#463f3a", body: "#5f574f", muted: "#857b72", accentFill: "#ffe8cc", accentStroke: "#c56a2d" },
  "research-mono": { fills: ["#f1f3f5", "#e9ecef", "#f8f9fa", "#dee2e6"], strokes: ["#343a40", "#495057", "#212529", "#5c6770"], title: "#111111", body: "#343a40", muted: "#6c757d", accentFill: "#e9ecef", accentStroke: "#212529" },
  "poster-bold": { fills: ["#ffd43b", "#ff8787", "#74c0fc", "#8ce99a"], strokes: ["#212529", "#c92a2a", "#1864ab", "#2b8a3e"], title: "#111111", body: "#212529", muted: "#495057", accentFill: "#ff922b", accentStroke: "#7f2b00" },
  "nature-notes": { fills: ["#e9f5db", "#fefae0", "#faedcd", "#d8e2dc"], strokes: ["#52734d", "#9c6644", "#7f5539", "#52796f"], title: "#283618", body: "#3f4f35", muted: "#6b705c", accentFill: "#dde5b6", accentStroke: "#606c38" },
};

const DEFAULT: PresentationSpec = { palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } };
const LAYOUTS = new Set<LayoutKind>(["debate-grid", "radial-map", "timeline", "swimlane-roadmap", "cluster-board", "evidence-tree"]);
const clampScale = (value: number | undefined) => Number.isFinite(value) ? Math.min(2, Math.max(0.6, value!)) : 1;

export function resolvePresentation(plan: Pick<RunPlan, "layout" | "style" | "presentation">, graph?: Pick<KnowledgeGraph, "kind" | "presentation">): PresentationSpec {
  const candidate = plan.presentation ?? graph?.presentation ?? DEFAULT;
  const graphFallback = graph?.presentation ?? DEFAULT;
  const layout = candidate.layout ?? plan.layout ?? graph?.kind;
  return {
    palette: candidate.palette ?? graphFallback.palette ?? plan.style,
    density: candidate.density ?? graphFallback.density,
    stroke: candidate.stroke ?? graphFallback.stroke,
    hierarchy: {
      title: clampScale(candidate.hierarchy?.title ?? graphFallback.hierarchy.title),
      keyFinding: clampScale(candidate.hierarchy?.keyFinding ?? graphFallback.hierarchy.keyFinding),
      evidence: clampScale(candidate.hierarchy?.evidence ?? graphFallback.hierarchy.evidence),
    },
    ...(layout && LAYOUTS.has(layout) ? { layout } : {}),
    ...(candidate.style ? { style: candidate.style } : {}),
  };
}

export function presentationTokens(spec: PresentationSpec): PresentationTokens {
  const density = spec.density === "compact" ? { spacing: 0.78, cardScale: 0.9 } : spec.density === "spacious" ? { spacing: 1.35, cardScale: 1.08 } : { spacing: 1, cardScale: 1 };
  const stroke = spec.stroke === "sketch" ? { roughness: 2, strokeWidth: 2, strokeStyle: "solid" as const } : spec.stroke === "marker" ? { roughness: 1, strokeWidth: 4, strokeStyle: "solid" as const } : { roughness: 0, strokeWidth: 2, strokeStyle: "solid" as const };
  return {
    palette: PALETTES[spec.palette] ?? PALETTES["zhihu-blue"],
    ...density,
    ...stroke,
    titleSize: Math.round(32 * clampScale(spec.hierarchy.title)),
    keyFindingSize: Math.round(20 * clampScale(spec.hierarchy.keyFinding)),
    evidenceSize: Math.round(14 * clampScale(spec.hierarchy.evidence)),
  };
}
