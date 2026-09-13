import type { KnowledgeGraph, KnowledgeNode, LayoutKind } from "./types.ts";
import { presentationTokens, resolvePresentation } from "./presentation.ts";

export type SceneElement = Record<string, unknown>;
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
const CARD_W = 320;
const CARD_H = 280;
const LINE_HEIGHT = 1.25;

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0) || 1;
}
function safeId(value: string): string {
  return `${value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "node"}-${hash(value).toString(16).padStart(8, "0")}`;
}
function widthOf(value: string, size: number): number {
  let width = 0;
  for (const char of value) width += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char) ? size : size * 0.55;
  return width;
}
function wrap(value: string, size: number, maxWidth: number, maxLines: number): string {
  const lines: string[] = [];
  let line = "";
  for (const char of value.replace(/\s+/g, " ").trim()) {
    if (line && widthOf(line + char, size) > maxWidth) { lines.push(line); line = char; } else line += char;
  }
  if (line) lines.push(line);
  const result = lines.slice(0, maxLines);
  if (lines.length > maxLines && result.length) result[result.length - 1] = `${result[result.length - 1].slice(0, -1)}…`;
  return result.join("\n");
}
function base(id: string, type: string, box: Box, tokens: ReturnType<typeof presentationTokens>): SceneElement {
  return { id, type, ...box, angle: 0, strokeColor: tokens.palette.title, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: tokens.strokeWidth, strokeStyle: tokens.strokeStyle, roughness: tokens.roughness, opacity: 100, groupIds: [], frameId: null, index: null, roundness: type === "rectangle" ? { type: 3 } : null, seed: hash(id), version: 1, versionNonce: hash(`${id}-version`), isDeleted: false, boundElements: null, updated: 1, link: null, locked: false };
}
function text(id: string, x: number, y: number, value: string, size: number, color: string, maxWidth: number, tokens: ReturnType<typeof presentationTokens>): SceneElement {
  const lines = value.split("\n");
  return { ...base(id, "text", { x, y, width: Math.min(maxWidth, Math.max(20, ...lines.map((line) => widthOf(line, size)))), height: Math.max(1, lines.length) * size * LINE_HEIGHT }, tokens), text: value, originalText: value, fontSize: size, fontFamily: 5, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: false, lineHeight: LINE_HEIGHT, strokeColor: color };
}
function arrow(id: string, from: Point, to: Point, startNodeId: string, endNodeId: string, tokens: ReturnType<typeof presentationTokens>): SceneElement {
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
  const dx = to.x - from.x, dy = to.y - from.y;
  return { ...base(id, "arrow", { x, y, width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) }, tokens), points: [[from.x - x, from.y - y], [to.x - x, to.y - y]], lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow", startNodeId, endNodeId };
}
function header(graph: KnowledgeGraph, tokens: ReturnType<typeof presentationTokens>): SceneElement[] {
  return [text("graph-title", 60, 30, wrap(graph.title, tokens.titleSize, 420, 2), tokens.titleSize, tokens.palette.title, 420, tokens), ...(graph.summary ? [text("graph-summary", 60, 30 + tokens.titleSize * 2.5, wrap(graph.summary, tokens.evidenceSize, 420, 3), tokens.evidenceSize, tokens.palette.muted, 420, tokens)] : [])];
}
function card(node: KnowledgeNode, box: Box, index: number, tokens: ReturnType<typeof presentationTokens>, fillIndex = index): SceneElement[] {
  const id = `node-${safeId(node.id)}`;
  const fill = tokens.palette.fills[fillIndex % tokens.palette.fills.length];
  const stroke = tokens.palette.strokes[fillIndex % tokens.palette.strokes.length];
  const innerWidth = box.width - 40;
  const title = wrap(node.label, tokens.keyFindingSize, innerWidth, 2);
  const body = wrap(node.description, tokens.evidenceSize, innerWidth, 4);
  return [{ ...base(id, "rectangle", box, tokens), backgroundColor: fill, strokeColor: stroke, strokeWidth: node.emphasis === "high" ? tokens.strokeWidth + 1 : tokens.strokeWidth, link: node.citations[0] ?? null, customData: { nodeId: node.id } }, text(`${id}-title`, box.x + 20, box.y + 20, title, tokens.keyFindingSize, stroke, innerWidth, tokens), text(`${id}-body`, box.x + 20, box.y + 76, body, tokens.evidenceSize, tokens.palette.body, innerWidth, tokens)];
}
function groupSlot(graph: KnowledgeGraph, nodeId: string, index: number): { group: number; slot: number } {
  const group = graph.groups.findIndex((candidate) => candidate.nodeIds.includes(nodeId));
  if (group >= 0) return { group, slot: graph.groups[group].nodeIds.indexOf(nodeId) };
  return { group: graph.groups.length, slot: index };
}
function positions(graph: KnowledgeGraph, layout: LayoutKind, tokens: ReturnType<typeof presentationTokens>): Box[] {
  const nodes = graph.nodes.slice(0, 24);
  const scale = tokens.cardScale;
  const width = CARD_W * scale, height = CARD_H * scale, gap = 80 * tokens.spacing;
  if (layout === "debate-grid") return nodes.map((_, i) => ({ x: 60 + (i % 2) * (width + 120 * tokens.spacing), y: 220 + Math.floor(i / 2) * (height + gap), width, height }));
  if (layout === "radial-map") {
    const cx = 760, cy = 600, radius = Math.max(680, width * Math.ceil(nodes.length / 2));
    return nodes.map((_, i) => { const angle = -Math.PI / 2 + Math.PI * 2 * i / Math.max(nodes.length, 1); return { x: cx + Math.cos(angle) * radius - width / 2, y: cy + Math.sin(angle) * radius - height / 2, width, height }; });
  }
  if (layout === "timeline") return nodes.map((_, i) => ({ x: 60 + i * (width + gap), y: 220 + (i % 2) * (height + gap), width, height }));
  if (layout === "swimlane-roadmap") return nodes.map((node, i) => { const slot = groupSlot(graph, node.id, i); return { x: 60 + slot.group * (width + 100 * tokens.spacing), y: 210 + slot.slot * (height + gap), width, height }; });
  if (layout === "cluster-board") return nodes.map((node, i) => { const slot = groupSlot(graph, node.id, i); return { x: 80 + slot.group * (width + 150 * tokens.spacing), y: 210 + slot.slot * (height + gap), width, height }; });
  return nodes.map((_, i) => ({ x: 600 + (i % 2) * (width + 120 * tokens.spacing), y: 220 + Math.floor(i / 2) * (height + gap), width, height }));
}
function render(graph: KnowledgeGraph, layout: LayoutKind): SceneElement[] {
  const spec = resolvePresentation({ layout, style: graph.presentation.palette, presentation: graph.presentation }, graph);
  const tokens = presentationTokens(spec);
  const elements = header(graph, tokens);
  const boxes = positions(graph, layout, tokens);
  boxes.forEach((box, i) => elements.push(...card(graph.nodes[i], box, i, tokens, i + (layout === "cluster-board" ? 1 : 0))));
  if (layout === "evidence-tree") {
    const root = { x: 60, y: 260, width: 420, height: 130 };
    elements.unshift({ ...base("evidence-root", "ellipse", root, tokens), backgroundColor: tokens.palette.accentFill, strokeColor: tokens.palette.accentStroke }, text("evidence-root-text", 90, 305, wrap(graph.title, tokens.keyFindingSize, 360, 2), tokens.keyFindingSize, tokens.palette.accentStroke, 360, tokens));
  }
  const seenEdges = new Map<string, number>();
  for (const edge of graph.edges) {
    const from = graph.nodes.findIndex((node) => node.id === edge.fromId), to = graph.nodes.findIndex((node) => node.id === edge.toId);
    if (from < 0 || to < 0 || !boxes[from] || !boxes[to]) continue;
    const key = `${from}-${to}`, occurrence = seenEdges.get(key) ?? 0;
    seenEdges.set(key, occurrence + 1);
    elements.push(arrow(`edge-${key}-${occurrence}`, { x: boxes[from].x + boxes[from].width, y: boxes[from].y + boxes[from].height / 2 }, { x: boxes[to].x, y: boxes[to].y + boxes[to].height / 2 }, edge.fromId, edge.toId, tokens));
  }
  return elements;
}

export const layoutRegistry: Partial<Record<LayoutKind, (graph: KnowledgeGraph) => SceneElement[]>> = { "debate-grid": (g) => render(g, "debate-grid"), "radial-map": (g) => render(g, "radial-map"), timeline: (g) => render(g, "timeline"), "swimlane-roadmap": (g) => render(g, "swimlane-roadmap"), "cluster-board": (g) => render(g, "cluster-board"), "evidence-tree": (g) => render(g, "evidence-tree") };
export function knowledgeGraphToScene(graph: KnowledgeGraph): SceneElement[] {
  const requested = graph.presentation.layout ?? graph.kind;
  return (layoutRegistry[requested] ?? layoutRegistry["radial-map"]!)(graph);
}
