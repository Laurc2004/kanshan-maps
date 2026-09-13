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
  if (lines.length === 0) return "";
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
function card(node: KnowledgeNode, box: Box, index: number, tokens: ReturnType<typeof presentationTokens>, fillIndex = index, link?: string | null): SceneElement[] {
  const id = `node-${safeId(node.id)}`;
  const fill = tokens.palette.fills[fillIndex % tokens.palette.fills.length];
  const stroke = tokens.palette.strokes[fillIndex % tokens.palette.strokes.length];
  const innerWidth = box.width - 40;
  const title = wrap(node.label, tokens.keyFindingSize, innerWidth, 2);
  const body = wrap(node.description, tokens.evidenceSize, innerWidth, 4);
  const elements = [{ ...base(id, "rectangle", box, tokens), backgroundColor: fill, strokeColor: stroke, strokeWidth: node.emphasis === "high" ? tokens.strokeWidth + 1 : tokens.strokeWidth, link: link ?? null, customData: { nodeId: node.id } }, text(`${id}-title`, box.x + 20, box.y + 20, title, tokens.keyFindingSize, stroke, innerWidth, tokens)];
  if (body) elements.push(text(`${id}-body`, box.x + 20, box.y + 76, body, tokens.evidenceSize, tokens.palette.body, innerWidth, tokens));
  // 有原文链接时给"↗ 原文"提示行（Excalidraw link 元素自带角标，点击由前端 onPointerDown 打开）
  if (link) {
    elements.push(text(`${id}-link`, box.x + 20, box.y + box.height - 34, "↗ 原文", tokens.evidenceSize - 2, stroke, innerWidth, tokens));
  }
  return elements;
}
function groupSlot(graph: KnowledgeGraph, nodeId: string, index: number): { group: number; slot: number } {
  const group = graph.groups.findIndex((candidate) => candidate.nodeIds.includes(nodeId));
  if (group >= 0) return { group, slot: graph.groups[group].nodeIds.indexOf(nodeId) };
  return { group: graph.groups.length, slot: index };
}
function positions(graph: KnowledgeGraph, layout: LayoutKind, tokens: ReturnType<typeof presentationTokens>): Box[] {
  // 展示上限与综合目标对齐（6-12 节点可读且不凑数）；超过的节点由 pruneFillerNodes 先行裁剪
  const nodes = graph.nodes.slice(0, 12);
  const scale = tokens.cardScale;
  const width = CARD_W * scale, height = CARD_H * scale, gap = 80 * tokens.spacing;
  if (layout === "debate-grid") {
    // 左右对立布局：按分组阵营分侧（组0=左、组1=右、其余组=中轴下方共识区）
    const left: number[] = [], right: number[] = [], center: number[] = [];
    const groupOf = (nodeId: string) => graph.groups.findIndex((grp) => grp.nodeIds.includes(nodeId));
    nodes.forEach((node, i) => {
      const gi = groupOf(node.id);
      if (gi === 0) left.push(i);
      else if (gi === 1) right.push(i);
      else center.push(i); // 无分组或第3+组都进共识区
    });
    const colW = width + 60 * tokens.spacing;
    const leftX = 80, rightX = 80 + colW * 2 + 120; // 中间留 120 分隔带
    const boxes: Box[] = [];
    left.forEach((idx, k) => { boxes[idx] = { x: leftX, y: 230 + k * (height + gap), width, height }; });
    right.forEach((idx, k) => { boxes[idx] = { x: rightX, y: 230 + k * (height + gap), width, height }; });
    const rows = Math.max(1, Math.ceil(center.length / 2));
    center.forEach((idx, k) => { boxes[idx] = { x: leftX + colW + (k % 2) * colW, y: 230 + Math.floor(k / 2) * (height + gap), width, height }; });
    // 共识区可能与左右列冲突时下移
    const maxY = Math.max(left.length, right.length) * (height + gap);
    const centerStartY = 230 + Math.max(maxY, rows * (height + gap));
    center.forEach((idx, k) => { boxes[idx].y = centerStartY + Math.floor(k / 2) * (height + gap) - rows * (height + gap) + (centerStartY > maxY ? 0 : (height + gap)); });
    return boxes;
  }
  if (layout === "radial-map") {
    // 半径按卡片弧长贴合计算：周长需容纳 n 张卡（每张占 width+gap 弧长），避免巨圈
    const circumferenceNeeded = nodes.length * (width + gap);
    const radius = Math.max(420, Math.ceil(circumferenceNeeded / (2 * Math.PI)) + width / 2);
    const cx = radius + width / 2 + 60, cy = radius + height / 2 + 60;
    return nodes.map((_, i) => { const angle = -Math.PI / 2 + Math.PI * 2 * i / Math.max(nodes.length, 1); return { x: cx + Math.cos(angle) * radius - width / 2, y: cy + Math.sin(angle) * radius - height / 2, width, height }; });
  }
  if (layout === "timeline") return nodes.map((_, i) => ({ x: 60 + i * (width + gap), y: 220 + (i % 2) * (height + gap), width, height }));
  if (layout === "swimlane-roadmap") return nodes.map((node, i) => { const slot = groupSlot(graph, node.id, i); return { x: 60 + slot.group * (width + 100 * tokens.spacing), y: 210 + slot.slot * (height + gap), width, height }; });
  if (layout === "cluster-board") return nodes.map((node, i) => { const slot = groupSlot(graph, node.id, i); return { x: 80 + slot.group * (width + 150 * tokens.spacing), y: 210 + slot.slot * (height + gap), width, height }; });
  if (layout === "evidence-tree") {
    // 子节点在 root 右侧双列竖排（root 宽 420）
    const rootRight = 480 + 60;
    return nodes.map((_, i) => ({ x: rootRight + (i % 2) * (width + 60), y: 210 + Math.floor(i / 2) * (height + 40), width, height }));
  }
  // concept-map 默认：有分组用 cluster-board 分簇；无分组用紧凑两列网格（近间距）
  const hasGroups = graph.groups.length > 0;
  if (hasGroups) return nodes.map((node, i) => { const slot = groupSlot(graph, node.id, i); return { x: 80 + slot.group * (width + 90 * tokens.spacing), y: 210 + slot.slot * (height + 40), width, height }; });
  return nodes.map((_, i) => ({ x: 80 + (i % 2) * (width + 60), y: 210 + Math.floor(i / 2) * (height + 40), width, height }));
}

// 边锚点按两卡相对位置动态选择，避免连线横穿卡片
function anchors(from: Box, to: Box): { start: Point; end: Point } {
  const cx1 = from.x + from.width / 2, cx2 = to.x + to.width / 2;
  const cy1 = from.y + from.height / 2, cy2 = to.y + to.height / 2;
  const dx = cx2 - cx1, dy = cy2 - cy1;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // 水平为主：从右/左边中点出发
    return dx >= 0
      ? { start: { x: from.x + from.width, y: cy1 }, end: { x: to.x, y: cy2 } }
      : { start: { x: from.x, y: cy1 }, end: { x: to.x + to.width, y: cy2 } };
  }
  // 垂直为主：从下/上边中点出发
  return dy >= 0
    ? { start: { x: cx1, y: from.y + from.height }, end: { x: cx2, y: to.y } }
    : { start: { x: cx1, y: from.y }, end: { x: cx2, y: to.y + to.height } };
}
function render(graph: KnowledgeGraph, layout: LayoutKind): SceneElement[] {
  const spec = resolvePresentation({ layout, style: graph.presentation.palette, presentation: graph.presentation }, graph);
  const tokens = presentationTokens(spec);
  const elements = header(graph, tokens);
  const boxes = positions(graph, layout, tokens);
  // 卡片链接：节点 citation id → 真实 URL（没有引用的节点不带链接）
  const urlByCitationId = new Map(graph.citations.map((citation) => [citation.id, citation.url]));
  const nodeLink = (node: KnowledgeNode): string | null => {
    for (const id of node.citations) {
      const url = urlByCitationId.get(id);
      if (url) return url;
    }
    return null;
  };
  boxes.forEach((box, i) => elements.push(...card(graph.nodes[i], box, i, tokens, i + (layout === "cluster-board" ? 1 : 0), nodeLink(graph.nodes[i]))));
  if (layout === "evidence-tree") {
    const root = { x: 60, y: 260, width: 420, height: 130 };
    elements.unshift({ ...base("evidence-root", "ellipse", root, tokens), backgroundColor: tokens.palette.accentFill, strokeColor: tokens.palette.accentStroke }, text("evidence-root-text", 90, 305, wrap(graph.title, tokens.keyFindingSize, 360, 2), tokens.keyFindingSize, tokens.palette.accentStroke, 360, tokens));
    graph.nodes.slice(0, 12).forEach((node, i) => {
      const child = boxes[i];
      elements.push(arrow(`evidence-root-edge-${i}`, { x: root.x + root.width, y: root.y + root.height / 2 }, { x: child.x, y: child.y + child.height / 2 }, "evidence-root", node.id, tokens));
    });
  }
  const seenEdges = new Map<string, number>();
  // 边限流：每个节点最多连 1 条出边 + 1 条入边，只保留语义最强的关系，防止蜘蛛网
  const outCount = new Map<string, number>(), inCount = new Map<string, number>();
  for (const edge of graph.edges) {
    const from = graph.nodes.findIndex((node) => node.id === edge.fromId), to = graph.nodes.findIndex((node) => node.id === edge.toId);
    if (from < 0 || to < 0 || !boxes[from] || !boxes[to]) continue;
    if ((outCount.get(edge.fromId) ?? 0) >= 1 || (inCount.get(edge.toId) ?? 0) >= 1) continue;
    outCount.set(edge.fromId, (outCount.get(edge.fromId) ?? 0) + 1);
    inCount.set(edge.toId, (inCount.get(edge.toId) ?? 0) + 1);
    const key = `${from}-${to}`, occurrence = seenEdges.get(key) ?? 0;
    seenEdges.set(key, occurrence + 1);
    // 锚点按相对位置动态选择，避免直线横穿中间卡片
    const { start, end } = anchors(boxes[from], boxes[to]);
    elements.push(arrow(`edge-${key}-${occurrence}`, start, end, edge.fromId, edge.toId, tokens));
  }
  // debate-grid：阵营标签 + 中轴分隔线
  if (layout === "debate-grid" && graph.groups.length >= 2) {
    const labels: [string, number][] = [[graph.groups[0].label, 80], [graph.groups[1].label, 80 + (CARD_W * tokens.cardScale + 60 * tokens.spacing) * 2 + 120]];
    for (const [label, x] of labels) {
      elements.push(text(`side-label-${x}`, x, 180, wrap(label, tokens.titleSize, 320, 1), tokens.titleSize, tokens.palette.title, 320, tokens));
    }
    const midX = 80 + CARD_W * tokens.cardScale + 60 * tokens.spacing;
    elements.push({ ...base("debate-divider", "line", { x: midX, y: 170, width: 0, height: Math.max(...boxes.map((b) => b.y + b.height), 900) - 170 }, tokens), points: [[0, 0], [0, Math.max(...boxes.map((b) => b.y + b.height), 900) - 170]], strokeStyle: "dashed", strokeWidth: 1, opacity: 60 });
  }
  return elements;
}

export const layoutRegistry: Partial<Record<LayoutKind, (graph: KnowledgeGraph) => SceneElement[]>> = { "debate-grid": (g) => render(g, "debate-grid"), "radial-map": (g) => render(g, "radial-map"), timeline: (g) => render(g, "timeline"), "swimlane-roadmap": (g) => render(g, "swimlane-roadmap"), "cluster-board": (g) => render(g, "cluster-board"), "evidence-tree": (g) => render(g, "evidence-tree") };
export function knowledgeGraphToScene(graph: KnowledgeGraph): SceneElement[] {
  const requested = graph.presentation.layout ?? graph.kind;
  return (layoutRegistry[requested] ?? layoutRegistry["radial-map"]!)(graph);
}
