import type { KnowledgeGraph, KnowledgeNode, LayoutKind } from "./types.ts";
import { presentationTokens, resolvePresentation } from "./presentation.ts";

export type SceneElement = Record<string, unknown>;
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
const CARD_W = 320;
const CARD_W_DEBATE = 400; // P26：观点对照卡片加宽（左右两列 400+400+140 列间隙 = 940，画布仍紧凑），配合全文字显示
const CARD_H = 132; // 卡片最小高度（P24：内容主导，280 的旧最小值让稀疏卡片大面积留白）；实际高度按内容行数动态计算
const LINE_HEIGHT = 1.25;
const CARD_PAD = 18; // 卡片内边距（上下左右一致）
const TITLE_MAX_LINES = 2; // P24：标题最多 2 行，排版更紧凑（debate 卡片除外——P26 起标题全显示）
const BODY_MAX_LINES = 6; // S5：描述最多 6 行（debate 卡片除外——P26 起正文全显示）
const TITLE_BODY_GAP = 10; // P24：标题与正文之间的垂直间距收紧（16 太松）

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
// 折行并返回实际行（不做截断），行数供高度计算与 wrap() 复用
function wrapLines(value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of value.replace(/\s+/g, " ").trim()) {
    if (line && widthOf(line + char, size) > maxWidth) { lines.push(line); line = char; } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}
function wrap(value: string, size: number, maxWidth: number, maxLines: number): string {
  const lines = wrapLines(value, size, maxWidth);
  if (lines.length === 0) return "";
  const result = lines.slice(0, maxLines);
  if (lines.length > maxLines && result.length) result[result.length - 1] = `${result[result.length - 1].slice(0, -1)}…`;
  return result.join("\n");
}
function base(id: string, type: string, box: Box, tokens: ReturnType<typeof presentationTokens>): SceneElement {
  return { id, type, ...box, angle: 0, strokeColor: tokens.palette.title, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: tokens.strokeWidth, strokeStyle: tokens.strokeStyle, roughness: tokens.roughness, opacity: 100, groupIds: [], frameId: null, index: null, roundness: type === "rectangle" ? { type: 3 } : null, seed: hash(id), version: 1, versionNonce: hash(`${id}-version`), isDeleted: false, boundElements: null, updated: 1, link: null, locked: false };
}
function text(id: string, x: number, y: number, value: string, size: number, color: string, maxWidth: number, tokens: ReturnType<typeof presentationTokens>, fixedWidth = false): SceneElement {
  const lines = value.split("\n");
  // fixedWidth=true：宽度固定取 maxWidth（居中排版用，调用方负责把 x 对准容器左缘）
  const width = fixedWidth ? maxWidth : Math.min(maxWidth, Math.max(20, ...lines.map((line) => widthOf(line, size))));
  return { ...base(id, "text", { x, y, width, height: Math.max(1, lines.length) * size * LINE_HEIGHT }, tokens), text: value, originalText: value, fontSize: size, fontFamily: 5, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: false, lineHeight: LINE_HEIGHT, strokeColor: color };
}
// P24：主干连线也用 3 点贝塞尔（弯度默认 0.06，比汇聚线更平缓），手绘感统一
function arrow(id: string, from: Point, to: Point, startNodeId: string, endNodeId: string, tokens: ReturnType<typeof presentationTokens>, bend = 0.06): SceneElement {
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * len * bend, oy = (dx / len) * len * bend;
  const x = Math.min(from.x, to.x, mx + ox), y = Math.min(from.y, to.y, my + oy);
  return {
    ...base(id, "arrow", { x, y, width: Math.max(1, Math.abs(dx) + Math.abs(ox)), height: Math.max(1, Math.abs(dy) + Math.abs(oy)) }, tokens),
    points: [[from.x - x, from.y - y], [mx + ox - x, my + oy - y], [to.x - x, to.y - y]],
    roundness: { type: 2 },
    strokeColor: tokens.palette.muted,
    lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow", startNodeId, endNodeId,
  };
}
// 手绘曲线箭头：旧观点图/路线图同款 —— 3 点贝塞尔（中间控制点垂直偏移 bend×len），
// roundness type 2 = 曲线（type 3 是折角直线）。手绘感来自全局 roughness，不靠直角折线。
function curveArrow(id: string, from: Point, to: Point, startNodeId: string, endNodeId: string, tokens: ReturnType<typeof presentationTokens>, bend = 0.12, color?: string): SceneElement {
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * len * bend, oy = (dx / len) * len * bend;
  const x = Math.min(from.x, to.x, mx + ox), y = Math.min(from.y, to.y, my + oy);
  return {
    ...base(id, "arrow", { x, y, width: Math.max(1, Math.abs(dx) + Math.abs(ox)), height: Math.max(1, Math.abs(dy) + Math.abs(oy)) }, tokens),
    points: [[from.x - x, from.y - y], [mx + ox - x, my + oy - y], [to.x - x, to.y - y]],
    roundness: { type: 2 },
    ...(color ? { strokeColor: color } : {}),
    lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow", startNodeId, endNodeId,
  };
}
function header(graph: KnowledgeGraph, tokens: ReturnType<typeof presentationTokens>): SceneElement[] {
  // P25：标题/描述居中（textAlign center、文本框中心对齐整图中心 x=590），完整显示不截断；
  // 标题 28px（原 32 更容易折行）、宽 1100、最多 3 行——「文字一多就被截断」的修法是样式自适应
  const CX = 590;
  const titleSize = Math.min(tokens.titleSize, 28);
  const title = wrap(graph.title, titleSize, 1100, 3);
  const titleLines = title.split("\n").length;
  const titleEl = {
    ...text("graph-title", CX - 550, 32, title, titleSize, tokens.palette.title, 1100, tokens, true),
    textAlign: "center",
  };
  const summaryEl = graph.summary
    ? [{
        ...text("graph-summary", CX - 550, 32 + titleLines * titleSize * LINE_HEIGHT + 10, wrap(graph.summary, tokens.evidenceSize, 1100, 2), tokens.evidenceSize, tokens.palette.muted, 1100, tokens, true),
        textAlign: "center",
      }]
    : [];
  return [titleEl, ...summaryEl];
}
// S5/S6：卡高按实际行数动态计算（上内边距 + 标题行高 + 标题正文间距 + 正文行高 + 下内边距），CARD_H 仅作最小值
// P26：fullText=true 时标题/正文不截断（行数无上限），高度按完整内容撑开——debate 卡片专用
function cardHeight(node: KnowledgeNode, width: number, tokens: ReturnType<typeof presentationTokens>, fullText = false): number {
  // P30：节点级样式覆盖（字号缩放/卡宽/最小卡高）与渲染口径一致，否则文字会超卡底
  const style = nodeStyleOverrides(node);
  const effWidth = style.width ?? width;
  const fontScale = style.fontScale ?? 1;
  const titleSize = Math.round(tokens.keyFindingSize * fontScale);
  const bodySize = Math.round(tokens.evidenceSize * fontScale);
  const innerWidth = effWidth - CARD_PAD * 2;
  const titleLines = (fullText ? wrapLines(node.label, titleSize, innerWidth).length : Math.min(TITLE_MAX_LINES, wrapLines(node.label, titleSize, innerWidth).length)) || 1;
  const bodyLines = node.description ? (fullText ? wrapLines(node.description, bodySize, innerWidth).length : Math.min(BODY_MAX_LINES, wrapLines(node.description, bodySize, innerWidth).length)) : 0;
  const content = CARD_PAD + titleLines * titleSize * LINE_HEIGHT
    + (bodyLines ? TITLE_BODY_GAP + bodyLines * bodySize * LINE_HEIGHT + CARD_PAD : CARD_PAD);
  return Math.max(CARD_H * tokens.cardScale, style.height ?? 0, Math.ceil(content));
}
function card(node: KnowledgeNode, box: Box, index: number, tokens: ReturnType<typeof presentationTokens>, fillIndex = index, link?: string | null, fullText = false): SceneElement[] {
  const id = `node-${safeId(node.id)}`;
  // fillIndex < 0：白底卡（泳道内节点，描边用泳道色 = -fillIndex-1）
  const whiteFill = fillIndex < 0;
  const colorIdx = (whiteFill ? -fillIndex - 1 : fillIndex) % tokens.palette.fills.length;
  // P30 微调：节点级样式覆盖（set_node_style 写入 metadata.styleOverrides）优先于调色板默认值
  const style = nodeStyleOverrides(node);
  const fill = style.fill ?? (whiteFill ? "#ffffff" : tokens.palette.fills[colorIdx]);
  const stroke = style.stroke ?? tokens.palette.strokes[colorIdx % tokens.palette.strokes.length];
  const fontScale = style.fontScale ?? 1;
  const titleSize = Math.round(tokens.keyFindingSize * fontScale);
  const bodySize = Math.round(tokens.evidenceSize * fontScale);
  const innerWidth = box.width - CARD_PAD * 2;
  const title = fullText ? wrapLines(node.label, titleSize, innerWidth).join("\n") : wrap(node.label, titleSize, innerWidth, TITLE_MAX_LINES);
  const body = fullText ? wrapLines(node.description, bodySize, innerWidth).join("\n") : wrap(node.description, bodySize, innerWidth, BODY_MAX_LINES);
  const titleLineCount = title ? title.split("\n").length : 0;
  // 正文起点紧跟标题实际行数（与 cardHeight 的累计口径一致，确保文字不超卡底）
  const bodyY = box.y + CARD_PAD + Math.max(1, titleLineCount) * titleSize * LINE_HEIGHT + TITLE_BODY_GAP;
  // P24：标题用深色（palette.title）保证层级对比，强调卡加粗描边；正文 palette.body
  const elements = [{ ...base(id, "rectangle", box, tokens), backgroundColor: fill, strokeColor: stroke, strokeWidth: node.emphasis === "high" ? tokens.strokeWidth + 1 : tokens.strokeWidth, link: link ?? null, customData: { nodeId: node.id } }, text(`${id}-title`, box.x + CARD_PAD, box.y + CARD_PAD, title, titleSize, tokens.palette.title, innerWidth, tokens)];
  if (body) elements.push(text(`${id}-body`, box.x + CARD_PAD, bodyY, body, bodySize, tokens.palette.body, innerWidth, tokens));
  return elements;
}
function groupSlot(graph: KnowledgeGraph, nodeId: string, index: number): { group: number; slot: number } {
  const group = graph.groups.findIndex((candidate) => candidate.nodeIds.includes(nodeId));
  if (group >= 0) return { group, slot: graph.groups[group].nodeIds.indexOf(nodeId) };
  return { group: graph.groups.length, slot: index };
}
// 列内累计 y：按每张卡的实际高度堆叠，保证任意内容长度下零重叠
function stackY(cards: { index: number; height: number }[], startY: number, gap: number): Map<number, number> {
  const ys = new Map<number, number>();
  let y = startY;
  for (const cardInfo of cards) { ys.set(cardInfo.index, y); y += cardInfo.height + gap; }
  return ys;
}
// P30 微调：节点级样式覆盖（看山助手 set_node_style 写入 node.metadata.styleOverrides）
export interface NodeStyleOverrides {
  fill?: string;
  stroke?: string;
  fontScale?: number; // 0.7~1.5 字号缩放
  width?: number;     // 绝对宽（120~600）
  height?: number;    // 最小高（100~520）
}
export function nodeStyleOverrides(node: KnowledgeNode): NodeStyleOverrides {
  const raw = node.metadata?.styleOverrides;
  if (!raw || typeof raw !== "object") return {};
  const out: NodeStyleOverrides = {};
  const o = raw as Record<string, unknown>;
  if (typeof o.fill === "string" && /^#[0-9a-fA-F]{3,8}$/.test(o.fill)) out.fill = o.fill;
  if (typeof o.stroke === "string" && /^#[0-9a-fA-F]{3,8}$/.test(o.stroke)) out.stroke = o.stroke;
  if (typeof o.fontScale === "number" && Number.isFinite(o.fontScale)) out.fontScale = Math.min(1.5, Math.max(0.7, o.fontScale));
  if (typeof o.width === "number" && Number.isFinite(o.width)) out.width = Math.min(600, Math.max(120, o.width));
  if (typeof o.height === "number" && Number.isFinite(o.height)) out.height = Math.min(520, Math.max(100, o.height));
  return out;
}
// P30 微调：元素位置偏移（看山助手 move_element 写入 graph.metadata.elementOffsets[nodeId]）
export interface ElementOffset { dx: number; dy: number; }
export function elementOffsets(graph: KnowledgeGraph): Map<string, ElementOffset> {
  const map = new Map<string, ElementOffset>();
  const raw = graph.metadata?.elementOffsets;
  if (!raw || typeof raw !== "object") return map;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const { dx, dy } = value as { dx?: unknown; dy?: unknown };
      if (typeof dx === "number" && Number.isFinite(dx) && typeof dy === "number" && Number.isFinite(dy)) {
        map.set(key, { dx: Math.max(-800, Math.min(800, dx)), dy: Math.max(-800, Math.min(800, dy)) });
      }
    }
  }
  return map;
}
// P30 微调：全局间距系数（看山助手 set_spacing 写入 graph.metadata.spacingScale）
export function spacingScale(graph: KnowledgeGraph): number {
  const raw = graph.metadata?.spacingScale;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.min(1.6, Math.max(0.6, raw)) : 1;
}

function positionsBase(graph: KnowledgeGraph, layout: LayoutKind, tokens: ReturnType<typeof presentationTokens>): Box[] {
  // 展示上限与综合目标对齐（6-12 节点可读且不凑数）；超过的节点由 pruneFillerNodes 先行裁剪
  const nodes = graph.nodes.slice(0, 12);
  const scale = tokens.cardScale;
  const spacingK = spacingScale(graph); // P30：全局间距微调（0.6~1.6），叠加在 density 之上
  const width = CARD_W * scale, gap = 80 * tokens.spacing * spacingK;
  const heightOf = (node: KnowledgeNode) => cardHeight(node, width, tokens);
  if (layout === "debate-grid") {
    // 观点对照版式（P25）：中心问题胶囊 + 观点卡按组左右对立分列（组0=左列、组1=右列、其余组依次向下扩展列）
    // + 共识节点占位（由 render 合并成底部通栏长卡）。只有 id=question 的中心问题节点画成胶囊；
    // emphasis=high 是普通卡加粗描边（标重点不消失）
    // P26：观点卡加宽到 400 且文字全显示（标题/正文不截断），卡高按完整内容撑开
    const debateWidth = CARD_W_DEBATE * scale;
    const debateHeightOf = (node: KnowledgeNode) => cardHeight(node, debateWidth, tokens, true);
    const boxes: Box[] = [];
    const groupOf = (nodeId: string) => graph.groups.findIndex((grp) => grp.nodeIds.includes(nodeId));
    // 问题节点判定：compat 转换的图固定 id="question"；LLM 直接产的图（无固定 id）取第一个 emphasis=high 的节点
    let capsuleId = nodes.find((n) => n.id === "question")?.id;
    if (capsuleId === undefined) {
      const hi = nodes.findIndex((n) => n.emphasis === "high");
      if (hi >= 0) capsuleId = nodes[hi].id;
    }
    const colW = debateWidth + 140 * tokens.spacing;
    const X0 = 70, TOP = 260;
    const lanes = new Map<number, number[]>();
    nodes.forEach((node, i) => {
      if (node.id === capsuleId) { boxes[i] = { x: 0, y: 0, width: 0, height: 0 }; return; } // 占位，render 覆盖
      const gIdx = groupOf(node.id);
      const groupId = graph.groups[gIdx]?.id;
      if (node.group === "consensus" || groupId === "consensus") { boxes[i] = { x: 0, y: 0, width: 0, height: 0 }; return; } // 共识占位，render 合并
      const lane = gIdx >= 0 ? gIdx : 0;
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane)!.push(i);
    });
    for (const [lane, members] of [...lanes.entries()].sort((a, b) => a[0] - b[0])) {
      const ys = stackY(members.map((i) => ({ index: i, height: debateHeightOf(nodes[i]) })), TOP, gap);
      members.forEach((idx) => { boxes[idx] = { x: X0 + lane * colW, y: ys.get(idx)!, width: debateWidth, height: debateHeightOf(nodes[idx]) }; });
    }
    return boxes;
  }
  if (layout === "radial-map") {
    // 半径按卡片弧长贴合计算：周长需容纳 n 张卡（每张占 width+gap 弧长），避免巨圈
    // 高度用每张卡的实际高度，保证圆上相邻卡不重叠
    const maxHeight = Math.max(...nodes.map(heightOf), CARD_H * scale);
    const circumferenceNeeded = nodes.length * (width + gap);
    const radius = Math.max(420, Math.ceil(circumferenceNeeded / (2 * Math.PI)) + width / 2);
    const cx = radius + width / 2 + 60, cy = radius + maxHeight / 2 + 60;
    return nodes.map((node, i) => {
      const height = heightOf(node);
      const angle = -Math.PI / 2 + Math.PI * 2 * i / Math.max(nodes.length, 1);
      return { x: cx + Math.cos(angle) * radius - width / 2, y: cy + Math.sin(angle) * radius - height / 2, width, height };
    });
  }
  if (layout === "timeline") {
    // 时间线：奇偶两行交错，第二行从第一行最大卡高之下起排，防止动态高度后重叠
    const row0 = nodes.map((_, i) => i).filter((i) => i % 2 === 0);
    const row0Max = row0.length ? Math.max(...row0.map((i) => heightOf(nodes[i]))) : CARD_H * scale;
    return nodes.map((node, i) => ({ x: 60 + i * (width + gap), y: i % 2 === 0 ? 220 : 220 + row0Max + gap, width, height: heightOf(node) }));
  }
  if (layout === "swimlane-roadmap") {
    // 泳道横排：每组一条泳道（背景框由 render() 画），节点在泳道内竖排
    const lanes = new Map<number, number[]>();
    const slots = nodes.map((node, i) => {
      const slot = groupSlot(graph, node.id, i);
      if (!lanes.has(slot.group)) lanes.set(slot.group, []);
      lanes.get(slot.group)!.push(i);
      return slot;
    });
    const laneYs = new Map<number, Map<number, number>>();
    for (const [group, members] of lanes) laneYs.set(group, stackY(members.map((i) => ({ index: i, height: heightOf(nodes[i]) })), 210 + 64, gap));
    // 节点 x：泳道左缘 + 内边距 16
    return nodes.map((node, i) => ({ x: 60 + slots[i].group * (width + 100 * tokens.spacing) + 16, y: laneYs.get(slots[i].group)!.get(i)!, width: width - 32, height: heightOf(nodes[i]) }));
  }
  if (layout === "cluster-board") {
    const clusters = new Map<number, number[]>();
    const slots = nodes.map((node, i) => {
      const slot = groupSlot(graph, node.id, i);
      if (!clusters.has(slot.group)) clusters.set(slot.group, []);
      clusters.get(slot.group)!.push(i);
      return slot;
    });
    const clusterYs = new Map<number, Map<number, number>>();
    for (const [group, members] of clusters) clusterYs.set(group, stackY(members.map((i) => ({ index: i, height: heightOf(nodes[i]) })), 210, gap));
    return nodes.map((node, i) => ({ x: 80 + slots[i].group * (width + 150 * tokens.spacing), y: clusterYs.get(slots[i].group)!.get(i)!, width, height: heightOf(node) }));
  }
  if (layout === "evidence-tree") {
    if (graph.metadata?.mode === "summary") {
      // 思维导图：中心主题 + 左右对称分支（左侧奇数、右侧偶数交替），紧凑防长图
      const leftIdx = nodes.map((_, i) => i).filter((i) => i % 2 === 0);
      const rightIdx = nodes.map((_, i) => i).filter((i) => i % 2 === 1);
      const colHeight = (members: number[]) => members.reduce((sum, i) => sum + heightOf(nodes[i]), 0) + Math.max(0, members.length - 1) * gap;
      const maxCol = Math.max(colHeight(leftIdx), colHeight(rightIdx));
      const colTop = 260;
      // 垂直居中：短的一侧整体上移，让中心节点两侧视觉平衡
      const leftYs = stackY(leftIdx.map((i) => ({ index: i, height: heightOf(nodes[i]) })), colTop + Math.max(0, (maxCol - colHeight(leftIdx)) / 2), gap);
      const rightYs = stackY(rightIdx.map((i) => ({ index: i, height: heightOf(nodes[i]) })), colTop + Math.max(0, (maxCol - colHeight(rightIdx)) / 2), gap);
      return nodes.map((node, i) => {
        const isLeft = i % 2 === 0;
        return { x: isLeft ? 60 : width + 620, y: (isLeft ? leftYs : rightYs).get(i)!, width, height: heightOf(node) };
      });
    }
    // 子节点在 root 右侧双列竖排（root 宽 420）
    const rootRight = 480 + 60;
    const cols: [number[], number[]] = [[], []];
    nodes.forEach((_, i) => cols[i % 2].push(i));
    const colYs = cols.map((col) => stackY(col.map((i) => ({ index: i, height: heightOf(nodes[i]) })), 210, 40));
    return nodes.map((node, i) => ({ x: rootRight + (i % 2) * (width + 60), y: colYs[i % 2].get(i)!, width, height: heightOf(node) }));
  }
  // concept-map 默认：有分组用 cluster-board 分簇；无分组用紧凑两列网格（近间距）
  const hasGroups = graph.groups.length > 0;
  if (hasGroups) {
    const clusters = new Map<number, number[]>();
    const slots = nodes.map((node, i) => {
      const slot = groupSlot(graph, node.id, i);
      if (!clusters.has(slot.group)) clusters.set(slot.group, []);
      clusters.get(slot.group)!.push(i);
      return slot;
    });
    const clusterYs = new Map<number, Map<number, number>>();
    for (const [group, members] of clusters) clusterYs.set(group, stackY(members.map((i) => ({ index: i, height: heightOf(nodes[i]) })), 210, 40));
    return nodes.map((node, i) => ({ x: 80 + slots[i].group * (width + 90 * tokens.spacing), y: clusterYs.get(slots[i].group)!.get(i)!, width, height: heightOf(node) }));
  }
  const cols: [number[], number[]] = [[], []];
  nodes.forEach((_, i) => cols[i % 2].push(i));
  const colYs = cols.map((col) => stackY(col.map((i) => ({ index: i, height: heightOf(nodes[i]) })), 210, 40));
  return nodes.map((node, i) => ({ x: 80 + (i % 2) * (width + 60), y: colYs[i % 2].get(i)!, width, height: heightOf(node) }));
}

// P30：布局坐标之上叠加看山助手的单卡微调偏移（move_element），保持确定性；
// 单卡宽度覆盖（styleOverrides.width）在此统一应用——高度已由 cardHeight 按覆盖口径计算。
// 碰撞防护：变宽的卡若压到右侧相邻列，把被压的列整体推开（保持对齐节奏、零重叠）
function positions(graph: KnowledgeGraph, layout: LayoutKind, tokens: ReturnType<typeof presentationTokens>): Box[] {
  const base = positionsBase(graph, layout, tokens);
  const nodes = graph.nodes.slice(0, 12);
  const offsets = elementOffsets(graph);
  const anyOverrides = nodes.some((n) => nodeStyleOverrides(n).width !== undefined);
  if (offsets.size === 0 && !anyOverrides) return base;
  const boxes = base.map((box, i) => {
    const node = nodes[i];
    if (!node) return box;
    const style = nodeStyleOverrides(node);
    const width = style.width ?? box.width;
    // 宽度变化时以左缘为锚（不改变卡列左对齐节奏），高度按覆盖口径重算
    const height = cardHeight(node, box.width, tokens, layout === "debate-grid");
    const off = offsets.get(node.id);
    return { x: box.x + (off?.dx ?? 0), y: box.y + (off?.dy ?? 0), width, height };
  });
  if (!anyOverrides) return boxes;
  // 推开被变宽卡压住的右侧卡：仅当与变宽卡垂直区间有重叠（同一行/邻近行）才算被压，
  // 同列上下方的卡（垂直不重叠）不动——否则会把整列错推到右边
  const changed = boxes
    .map((box, i) => ({ box, i, delta: box.width - base[i].width }))
    .filter((entry) => entry.delta > 0);
  for (const { box } of changed) {
    const need = box.x + box.width + 12;
    for (let j = 0; j < boxes.length; j++) {
      const other = boxes[j];
      if (other === box) continue;
      const verticalOverlap = other.y < box.y + box.height && other.y + other.height > box.y;
      if (verticalOverlap && other.x > box.x && other.x < need) other.x = need;
    }
  }
  return boxes;
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
  // 看山助手 remove_edges 去掉的连线集合（"fromId→toId"），对数据型边和固定装饰箭头统一生效
  const removedEdges = new Set(
    Array.isArray(graph.metadata?.removedEdges)
      ? (graph.metadata.removedEdges as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  );
  const edgeGone = (a: string, b: string) => removedEdges.has(`${a}→${b}`) || removedEdges.has(`${b}→${a}`);
  // 看山助手 add_group（label 为空）登记的「大卡片容器」分组：画包住成员卡的圆角大框
  const containerIds = new Set(
    Array.isArray(graph.metadata?.groupContainers)
      ? (graph.metadata.groupContainers as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  );
  // 卡片链接：节点 citation id → 真实 URL（没有引用的节点不带链接）
  // metadata.linksEnabled === false 时（看山助手「去除超链接」）所有卡片不带链接；来源数据保留在底部索引
  const linksEnabled = graph.metadata?.linksEnabled !== false;
  const urlByCitationId = new Map(graph.citations.map((citation) => [citation.id, citation.url]));
  const nodeLink = (node: KnowledgeNode): string | null => {
    if (!linksEnabled) return null;
    for (const id of node.citations) {
      const url = urlByCitationId.get(id);
      if (url) return url;
    }
    return null;
  };
  // 与 positions() 同一判定：id=question 优先，否则第一个 emphasis=high（LLM 直产图）
  const capsuleNodeId = layout === "debate-grid"
    ? (graph.nodes.slice(0, 12).find((n) => n.id === "question") ?? graph.nodes.slice(0, 12).find((n) => n.emphasis === "high"))?.id
    : undefined;
  const isCapsuleNode = layout === "debate-grid" ? (node: KnowledgeNode) => node.id === capsuleNodeId : () => false;
  // P25：debate-grid 下卡片渲染由专用分支处理（跳过通用循环——共识节点不画普通卡，合并成通栏长卡）
  const isConsensusNode = (node: KnowledgeNode): boolean => {
    if (layout !== "debate-grid") return false;
    if (node.group === "consensus") return true;
    const grp = graph.groups.find((g) => g.nodeIds.includes(node.id));
    return grp?.id === "consensus";
  };
  boxes.forEach((box, i) => {
    if (isCapsuleNode(graph.nodes[i]) || isConsensusNode(graph.nodes[i])) return; // 胶囊/共识在专用分支渲染
    // swimlane：节点卡用白色底 + 泳道色描边，浮在彩色泳道框上（旧学习路线版式）
    const fillIdx = layout === "swimlane-roadmap" ? -(groupSlot(graph, graph.nodes[i].id, i).group + 1) : i + (layout === "cluster-board" ? 1 : 0);
    // P26：debate 卡片文字全显示（标题/正文不截断，卡高已在 positions 按完整内容撑开）
    elements.push(...card(graph.nodes[i], box, i, tokens, fillIdx, nodeLink(graph.nodes[i]), layout === "debate-grid"));
  });
  // 「大卡片容器」：看山助手 add_group(label="") 的产物。按成员卡包围盒画圆角大框（虚线描边、极浅底色），
  // unshift 到元素数组最前确保被成员卡覆盖在最底层；不动成员卡的坐标与归属，撤销= remove_nodes 不需要，直接再 add_group/move 即可
  for (const grp of graph.groups) {
    if (!containerIds.has(grp.id)) continue;
    const memberBoxes = grp.nodeIds
      .map((nid) => graph.nodes.findIndex((n) => n.id === nid))
      .filter((i) => i >= 0 && i < boxes.length && boxes[i] && boxes[i].width > 0)
      .map((i) => boxes[i]);
    if (memberBoxes.length === 0) continue;
    const PAD_OUT = 28;
    const minX = Math.min(...memberBoxes.map((b) => b.x)) - PAD_OUT;
    const minY = Math.min(...memberBoxes.map((b) => b.y)) - PAD_OUT - 26; // 顶部留出组标签位置
    const maxX = Math.max(...memberBoxes.map((b) => b.x + b.width)) + PAD_OUT;
    const maxY = Math.max(...memberBoxes.map((b) => b.y + b.height)) + PAD_OUT;
    elements.unshift(
      {
        ...base(`groupbox-${grp.id}`, "rectangle", { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, tokens),
        backgroundColor: "transparent",
        strokeColor: tokens.palette.muted,
        strokeStyle: "dashed",
        strokeWidth: tokens.strokeWidth + 0.5,
      },
    );
  }
  if (layout === "debate-grid") {
    // 观点对照版式（P25）：立场列头标签 + 中心问题胶囊 + 观点卡→胶囊按列换色曲线箭头 + 共识通栏长卡
    const capsuleIdx = graph.nodes.slice(0, 12).findIndex(isCapsuleNode);
    const shownNodes = graph.nodes.slice(0, 12);
    const grid = boxes.filter((_, i) => !isCapsuleNode(shownNodes[i]) && !isConsensusNode(shownNodes[i]));
    const gridW = grid.length ? Math.max(...grid.map((b) => b.x + b.width)) - Math.min(...grid.map((b) => b.x)) : CARD_W * tokens.cardScale;
    const gridX = grid.length ? Math.min(...grid.map((b) => b.x)) : 70;
    // P25：立场列头标签（按组），让左右对立的逻辑一眼可见
    const groupOf = (nodeId: string) => graph.groups.findIndex((grp) => grp.nodeIds.includes(nodeId));
    const lanes = new Map<number, number[]>();
    shownNodes.forEach((node, i) => {
      if (isCapsuleNode(node) || isConsensusNode(node)) return;
      const g = groupOf(node.id);
      const lane = g >= 0 ? g : 0;
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane)!.push(i);
    });
    const laneColor = (lane: number) => tokens.palette.strokes[lane % tokens.palette.strokes.length];
    for (const [lane, members] of [...lanes.entries()].sort((a, b) => a[0] - b[0])) {
      const label = graph.groups[lane]?.label;
      if (!label) continue;
      const x = boxes[members[0]].x;
      const top = Math.min(...members.map((i) => boxes[i].y));
      elements.push(text(`debate-stance-${lane}`, x, top - 34, wrap(label, 17, CARD_W * tokens.cardScale, 1), 17, laneColor(lane), CARD_W * tokens.cardScale, tokens));
    }
    // P24：胶囊宽度按问题文字自适应（320~520），文字最多 3 行完整显示不截断——中心问题是主角
    const qLabel = capsuleIdx >= 0 ? shownNodes[capsuleIdx].label : "";
    const qW = Math.max(320, Math.min(520, Math.ceil(widthOf(qLabel, 18)) + 56));
    const qText = qLabel ? `Q · ${wrap(qLabel, 18, qW - 36, 3)}` : "";
    const qLines = qText ? qText.split("\n").length : 1;
    const capsuleH = Math.max(72, qLines * 18 * LINE_HEIGHT + 34);
    const capsule: Box = { x: gridX + (gridW - qW) / 2, y: 150, width: qW, height: capsuleH };
    // P24：胶囊文字完整居中（fixedWidth + 双居中），不再固定 +18/+16 偏移
    elements.push(
      { ...base("debate-capsule", "rectangle", capsule, tokens), backgroundColor: tokens.palette.accentFill, strokeColor: tokens.palette.accentStroke, strokeWidth: tokens.strokeWidth + 0.5 },
      ...(capsuleIdx >= 0 ? [{
        ...text("debate-capsule-text", capsule.x + 18, capsule.y + (capsule.height - qLines * 18 * LINE_HEIGHT) / 2, qText, 18, tokens.palette.accentStroke, qW - 36, tokens, true),
        textAlign: "center", verticalAlign: "middle",
      }] : []),
    );
    // P26：观点卡 → 胶囊不再画箭头——列头立场标签 + 卡片按列分色已充分表达「卡属于哪一方」，
    // 箭头（即使走廊走线零压卡）在视觉上仍是噪音。只保留胶囊 → 共识横幅的绿色连线。
    const linkTargetId = capsuleNodeId ?? "question";
    // P25：共识通栏长卡（多条共识合并成一张，编号横排），胶囊 → 共识一条绿色曲线箭头
    const consensusNodes = shownNodes.filter((n) => isConsensusNode(n));
    if (consensusNodes.length) {
      const vpBottom = grid.length ? Math.max(...grid.map((b) => b.y + b.height)) : capsule.y + capsule.height;
      const consY = vpBottom + 56;
      const consW = gridW;
      const lineH = 15 * LINE_HEIGHT;
      const consH = Math.max(84, CARD_PAD + 20 * LINE_HEIGHT + 8 + consensusNodes.length * (lineH + 6) + CARD_PAD);
      const consBox: Box = { x: gridX, y: consY, width: consW, height: consH };
      const cIdx = tokens.palette.strokes.length > 2 ? 2 : 0; // 第三色（绿系）表达「共识」
      const consStroke = tokens.palette.strokes[cIdx];
      const consFill = tokens.palette.fills[cIdx];
      elements.push({ ...base("debate-consensus", "rectangle", consBox, tokens), backgroundColor: consFill, strokeColor: consStroke });
      elements.push(text("debate-consensus-label", consBox.x + CARD_PAD, consBox.y + CARD_PAD, "共识", 20, consStroke, consW - CARD_PAD * 2, tokens));
      consensusNodes.forEach((node, k) => {
        const line = wrap(`${k + 1}. ${node.label}${node.description ? `：${node.description}` : ""}`, 15, consW - CARD_PAD * 2 - 56, 2);
        elements.push(text(`debate-consensus-item-${k}`, consBox.x + CARD_PAD + 56, consBox.y + CARD_PAD + 20 * LINE_HEIGHT + 8 + k * (lineH + 6), line, 15, tokens.palette.body, consW - CARD_PAD * 2 - 56, tokens));
      });
      if (consensusNodes.length && !edgeGone(linkTargetId, "debate-consensus")) {
        elements.push(curveArrow("debate-consensus-link", { x: capsule.x + capsule.width / 2, y: capsule.y + capsule.height + 4 }, { x: consBox.x + consBox.width / 2, y: consBox.y - 4 }, linkTargetId, "debate-consensus", tokens, 0.06, consStroke));
      }
    }
  }
  if (layout === "evidence-tree") {
    const mindmap = graph.metadata?.mode === "summary";
    // 思维导图：根节点放在左右两列之间的走廊，垂直中心与分支列中心精确对齐
    // （与 positions() summary 分支共用 colTop=260 / 每列卡高+间距 的口径，密度变化也不漂移）
    // P24：根容器宽度按标题文字自适应（200~380），文字 3 行完整显示；单行用椭圆、多行用圆角矩形
    const rootTitleFull = graph.title;
    const rootW = mindmap
      ? Math.max(200, Math.min(380, Math.ceil(Math.max(...wrapLines(rootTitleFull, tokens.keyFindingSize, 380).map((l) => widthOf(l, tokens.keyFindingSize)), 120)) + 56))
      : 420;
    const rootTitle = wrap(rootTitleFull, tokens.keyFindingSize, rootW - 60, 3);
    const rootTextLines = rootTitle.split("\n").length;
    const rootH = Math.max(110, rootTextLines * tokens.keyFindingSize * LINE_HEIGHT + 56);
    const rootShape = rootTextLines === 1 ? "ellipse" : "rectangle";
    const root = mindmap
      ? (() => {
          const stepGap = 80 * tokens.spacing;
          const colTop = 260;
          const colHeight = (members: Box[]) =>
            members.reduce((sum, box) => sum + box.height, 0) + Math.max(0, members.length - 1) * stepGap;
          const leftBoxes = boxes.filter((_, i) => i % 2 === 0);
          const rightBoxes = boxes.filter((_, i) => i % 2 === 1);
          const maxCol = Math.max(colHeight(leftBoxes), colHeight(rightBoxes), rootH);
          return { x: CARD_W * tokens.cardScale + 170, y: colTop + (maxCol - rootH) / 2, width: rootW, height: rootH };
        })()
      : { x: 60, y: 260, width: 420, height: rootH };
    // 思维导图分支箭头必须指向卡片侧边缘中点：根在左右两列中间，箭头走水平
    // （通用 anchors() 会把上下错位的卡判成垂直连线，从卡片顶部穿入，视觉上压到上面的卡）
    const mindmapAnchor = (child: Box): { start: Point; end: Point } => {
      const rootCy = root.y + root.height / 2;
      const childCy = child.y + child.height / 2;
      return child.x >= root.x + root.width
        ? { start: { x: root.x + root.width, y: rootCy }, end: { x: child.x, y: childCy } }
        : { start: { x: root.x, y: rootCy }, end: { x: child.x + child.width, y: childCy } };
    };
    // P24：文字块完整居中（fixedWidth + 双居中）；容器形状单行椭圆/多行圆角矩形
    elements.unshift(
      { ...base("evidence-root", rootShape, root, tokens), backgroundColor: tokens.palette.accentFill, strokeColor: tokens.palette.accentStroke },
      {
        ...text(
          "evidence-root-text",
          root.x + (root.width - (rootW - 60)) / 2,
          root.y + (root.height - rootTextLines * tokens.keyFindingSize * LINE_HEIGHT) / 2,
          rootTitle, tokens.keyFindingSize, tokens.palette.accentStroke, rootW - 60, tokens, true,
        ),
        textAlign: "center",
        verticalAlign: "middle",
      },
    );
    graph.nodes.slice(0, 12).forEach((node, i) => {
      if (edgeGone("evidence-root", node.id)) return; // 看山助手去掉了根→该卡的连线
      const child = boxes[i];
      const { start, end } = mindmap ? mindmapAnchor(child) : anchors(root, child);
      elements.push(arrow(`evidence-root-edge-${i}`, start, end, "evidence-root", node.id, tokens));
    });
  }
  const seenEdges = new Map<string, number>();
  // 边限流：每个节点最多连 1 条出边 + 1 条入边，只保留语义最强的关系，防止蜘蛛网
  const outCount = new Map<string, number>(), inCount = new Map<string, number>();
  // debate-grid：边已由「卡→胶囊」汇聚箭头表达，跳过 edges 防蜘蛛网；swimlane 同理（阶段箭头已画）
  if (layout !== "debate-grid" && layout !== "swimlane-roadmap") for (const edge of graph.edges) {
    if (edgeGone(edge.fromId, edge.toId)) continue; // 看山助手已去掉这条连线（剩余边自动递补进限流名额）
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
  if (layout === "swimlane-roadmap") {
    // 泳道背景框 + 阶段标题 + 阶段间曲线箭头（学习路线旧版式）
    const scale = tokens.cardScale;
    const laneW = CARD_W * scale;
    const laneGroups = new Map<number, Box[]>();
    boxes.forEach((box, i) => {
      const slot = groupSlot(graph, graph.nodes[i].id, i);
      if (!laneGroups.has(slot.group)) laneGroups.set(slot.group, []);
      laneGroups.get(slot.group)!.push(box);
    });
    const laneBoxes: { group: number; box: Box }[] = [];
    for (const [group, members] of [...laneGroups.entries()].sort((a, b) => a[0] - b[0])) {
      const x = 60 + group * (laneW + 100 * tokens.spacing);
      const bottom = Math.max(...members.map((b) => b.y + b.height));
      laneBoxes.push({ group, box: { x, y: 210, width: laneW, height: bottom - 210 + 16 } });
    }
    // P24：泳道高度对齐到最高一条，视觉上是一排等高的彩色列（节点数不均时不再高矮悬殊）
    const maxLaneBottom = Math.max(...laneBoxes.map((l) => l.box.y + l.box.height));
    for (const { group, box } of laneBoxes) {
      box.height = maxLaneBottom - box.y;
      const label = graph.groups[group]?.label ?? `第${group + 1}站`;
      elements.unshift(
        { ...base(`lane-${group}`, "rectangle", box, tokens), backgroundColor: tokens.palette.fills[group % tokens.palette.fills.length], strokeColor: tokens.palette.strokes[group % tokens.palette.strokes.length], opacity: 55 },
        text(`lane-head-${group}`, box.x + 18, 230, wrap(`第${group + 1}站 · ${label}`, tokens.keyFindingSize, box.width - 36, 1), tokens.keyFindingSize, tokens.palette.strokes[group % tokens.palette.strokes.length], box.width - 36, tokens),
      );
    }
    // 阶段间曲线箭头（泳道间走廊内，旧路线图同款微弯）；被看山助手去掉的站间箭头按 removedEdges 隐藏
    for (let k = 0; k < laneBoxes.length - 1; k++) {
      const a = laneBoxes[k].box, b = laneBoxes[k + 1].box;
      if (edgeGone(`lane-${k}`, `lane-${k + 1}`)) continue;
      elements.push(curveArrow(`lane-arrow-${k}`, { x: a.x + a.width + 8, y: a.y + 70 }, { x: b.x - 8, y: b.y + 70 }, `lane-${k}`, `lane-${k + 1}`, tokens, (k % 2 === 0 ? 0.1 : -0.1), tokens.palette.muted));
    }
  }
  return elements;
}

export const layoutRegistry: Partial<Record<LayoutKind, (graph: KnowledgeGraph) => SceneElement[]>> = { "debate-grid": (g) => render(g, "debate-grid"), "radial-map": (g) => render(g, "radial-map"), timeline: (g) => render(g, "timeline"), "swimlane-roadmap": (g) => render(g, "swimlane-roadmap"), "cluster-board": (g) => render(g, "cluster-board"), "evidence-tree": (g) => render(g, "evidence-tree") };
export function knowledgeGraphToScene(graph: KnowledgeGraph): SceneElement[] {
  const requested = graph.presentation.layout ?? graph.kind;
  return (layoutRegistry[requested] ?? layoutRegistry["radial-map"]!)(graph);
}
