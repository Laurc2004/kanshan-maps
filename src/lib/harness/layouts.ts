import type { KnowledgeGraph, KnowledgeNode, LayoutKind } from "./types.ts";
import { presentationTokens, resolvePresentation } from "./presentation.ts";

export type SceneElement = Record<string, unknown>;
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
const CARD_W = 320;
const CARD_H = 280; // 卡片最小高度；实际高度按内容行数动态计算
const LINE_HEIGHT = 1.25;
const CARD_PAD = 20; // 卡片内边距（上下左右一致）
const TITLE_MAX_LINES = 3; // S5：标题最多 3 行
const BODY_MAX_LINES = 6; // S5：描述最多 6 行
const TITLE_BODY_GAP = 16; // 标题与正文之间的垂直间距

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
function text(id: string, x: number, y: number, value: string, size: number, color: string, maxWidth: number, tokens: ReturnType<typeof presentationTokens>): SceneElement {
  const lines = value.split("\n");
  return { ...base(id, "text", { x, y, width: Math.min(maxWidth, Math.max(20, ...lines.map((line) => widthOf(line, size)))), height: Math.max(1, lines.length) * size * LINE_HEIGHT }, tokens), text: value, originalText: value, fontSize: size, fontFamily: 5, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: false, lineHeight: LINE_HEIGHT, strokeColor: color };
}
function arrow(id: string, from: Point, to: Point, startNodeId: string, endNodeId: string, tokens: ReturnType<typeof presentationTokens>): SceneElement {
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
  const dx = to.x - from.x, dy = to.y - from.y;
  return { ...base(id, "arrow", { x, y, width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) }, tokens), points: [[from.x - x, from.y - y], [to.x - x, to.y - y]], lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow", startNodeId, endNodeId };
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
  return [text("graph-title", 60, 30, wrap(graph.title, tokens.titleSize, 420, 2), tokens.titleSize, tokens.palette.title, 420, tokens), ...(graph.summary ? [text("graph-summary", 60, 30 + tokens.titleSize * 2.5, wrap(graph.summary, tokens.evidenceSize, 420, 3), tokens.evidenceSize, tokens.palette.muted, 420, tokens)] : [])];
}
// S5/S6：卡高按实际行数动态计算（上内边距 + 标题行高 + 标题正文间距 + 正文行高 + 下内边距），CARD_H 仅作最小值
function cardHeight(node: KnowledgeNode, width: number, tokens: ReturnType<typeof presentationTokens>): number {
  const innerWidth = width - CARD_PAD * 2;
  const titleLines = Math.min(TITLE_MAX_LINES, wrapLines(node.label, tokens.keyFindingSize, innerWidth).length) || 1;
  const bodyLines = node.description ? Math.min(BODY_MAX_LINES, wrapLines(node.description, tokens.evidenceSize, innerWidth).length) : 0;
  const content = CARD_PAD + titleLines * tokens.keyFindingSize * LINE_HEIGHT
    + (bodyLines ? TITLE_BODY_GAP + bodyLines * tokens.evidenceSize * LINE_HEIGHT + CARD_PAD : CARD_PAD);
  return Math.max(CARD_H * tokens.cardScale, Math.ceil(content));
}
function card(node: KnowledgeNode, box: Box, index: number, tokens: ReturnType<typeof presentationTokens>, fillIndex = index, link?: string | null): SceneElement[] {
  const id = `node-${safeId(node.id)}`;
  // fillIndex < 0：白底卡（泳道内节点，描边用泳道色 = -fillIndex-1）
  const whiteFill = fillIndex < 0;
  const colorIdx = (whiteFill ? -fillIndex - 1 : fillIndex) % tokens.palette.fills.length;
  const fill = whiteFill ? "#ffffff" : tokens.palette.fills[colorIdx];
  const stroke = tokens.palette.strokes[colorIdx % tokens.palette.strokes.length];
  const innerWidth = box.width - CARD_PAD * 2;
  const title = wrap(node.label, tokens.keyFindingSize, innerWidth, TITLE_MAX_LINES);
  const body = wrap(node.description, tokens.evidenceSize, innerWidth, BODY_MAX_LINES);
  const titleLineCount = title ? title.split("\n").length : 0;
  // 正文起点紧跟标题实际行数（与 cardHeight 的累计口径一致，确保文字不超卡底）
  const bodyY = box.y + CARD_PAD + Math.max(1, titleLineCount) * tokens.keyFindingSize * LINE_HEIGHT + TITLE_BODY_GAP;
  const elements = [{ ...base(id, "rectangle", box, tokens), backgroundColor: fill, strokeColor: stroke, strokeWidth: node.emphasis === "high" ? tokens.strokeWidth + 1 : tokens.strokeWidth, link: link ?? null, customData: { nodeId: node.id } }, text(`${id}-title`, box.x + CARD_PAD, box.y + CARD_PAD, title, tokens.keyFindingSize, stroke, innerWidth, tokens)];
  if (body) elements.push(text(`${id}-body`, box.x + CARD_PAD, bodyY, body, tokens.evidenceSize, tokens.palette.body, innerWidth, tokens));
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
function positions(graph: KnowledgeGraph, layout: LayoutKind, tokens: ReturnType<typeof presentationTokens>): Box[] {
  // 展示上限与综合目标对齐（6-12 节点可读且不凑数）；超过的节点由 pruneFillerNodes 先行裁剪
  const nodes = graph.nodes.slice(0, 12);
  const scale = tokens.cardScale;
  const width = CARD_W * scale, gap = 80 * tokens.spacing;
  const heightOf = (node: KnowledgeNode) => cardHeight(node, width, tokens);
  if (layout === "debate-grid") {
    // 观点对照版式：中心问题胶囊 + 观点卡 2×2 网格（列内垂直堆叠）+ 共识卡底部通栏
    // 问题/强调卡（id=question 或 emphasis=high）不进网格，由 render() 画成中心胶囊
    const boxes: Box[] = [];
    const groupOf = (nodeId: string) => graph.groups.findIndex((grp) => grp.nodeIds.includes(nodeId));
    const viewpoints: number[] = [], consensus: number[] = [];
    nodes.forEach((node, i) => {
      if (node.id === "question" || node.emphasis === "high") { boxes[i] = { x: 0, y: 0, width: 0, height: 0 }; return; } // 占位，render 覆盖
      const groupId = graph.groups[groupOf(node.id)]?.id;
      if (node.group === "consensus" || groupId === "consensus") consensus.push(i);
      else viewpoints.push(i);
    });
    const colW = width + 150 * tokens.spacing;
    const X0 = 70, TOP = 260;
    const cols: [number[], number[]] = [[], []];
    viewpoints.forEach((idx, k) => cols[k % 2].push(idx));
    const colYs = cols.map((col) => stackY(col.map((i) => ({ index: i, height: heightOf(nodes[i]) })), TOP, gap));
    cols.forEach((col, colIdx) => col.forEach((idx) => { boxes[idx] = { x: X0 + colIdx * colW, y: colYs[colIdx].get(idx)!, width, height: heightOf(nodes[idx]) }; }));
    // 共识卡：观点区下方通栏横排
    const vpBottom = viewpoints.length ? Math.max(...viewpoints.map((idx) => boxes[idx].y + boxes[idx].height)) : TOP;
    const consYs = stackY(consensus.map((i) => ({ index: i, height: heightOf(nodes[i]) })), vpBottom + gap, gap);
    consensus.forEach((idx, k) => { boxes[idx] = { x: X0 + k * colW, y: consYs.get(idx)!, width, height: heightOf(nodes[idx]) }; });
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
  const isCapsuleNode = layout === "debate-grid" ? (node: KnowledgeNode) => node.id === "question" || node.emphasis === "high" : () => false;
  boxes.forEach((box, i) => {
    if (isCapsuleNode(graph.nodes[i])) return; // 中心胶囊在下方单独渲染
    // swimlane：节点卡用白色底 + 泳道色描边，浮在彩色泳道框上（旧学习路线版式）
    const fillIdx = layout === "swimlane-roadmap" ? -(groupSlot(graph, graph.nodes[i].id, i).group + 1) : i + (layout === "cluster-board" ? 1 : 0);
    elements.push(...card(graph.nodes[i], box, i, tokens, fillIdx, nodeLink(graph.nodes[i])));
  });
  if (layout === "debate-grid") {
    // 观点对照版式：中心问题胶囊（走廊上方居中）+ 每张观点卡 → 胶囊的汇聚箭头
    const capsuleIdx = graph.nodes.slice(0, 12).findIndex(isCapsuleNode);
    const grid = boxes.filter((_, i) => !isCapsuleNode(graph.nodes[i]));
    const gridW = grid.length ? Math.max(...grid.map((b) => b.x + b.width)) - Math.min(...grid.map((b) => b.x)) : CARD_W * tokens.cardScale;
    const gridX = grid.length ? Math.min(...grid.map((b) => b.x)) : 70;
    const qW = 300;
    const qText = capsuleIdx >= 0 ? `Q · ${wrap(graph.nodes[capsuleIdx].label, 18, qW - 36, 2)}` : "";
    const qLines = qText ? qText.split("\n").length : 1;
    const capsuleH = Math.max(72, qLines * 18 * LINE_HEIGHT + 34);
    const capsule: Box = { x: gridX + (gridW - qW) / 2, y: 150, width: qW, height: capsuleH };
    elements.push(
      { ...base("debate-capsule", "rectangle", capsule, tokens), backgroundColor: tokens.palette.accentFill, strokeColor: tokens.palette.accentStroke, strokeWidth: tokens.strokeWidth + 0.5 },
      ...(capsuleIdx >= 0 ? [{ ...text("debate-capsule-text", capsule.x + 18, capsule.y + 16, qText, 18, tokens.palette.accentStroke, qW - 36, tokens), textAlign: "center" }] : []),
    );
    // 观点卡 → 胶囊的汇聚曲线箭头（旧观点图手法：两端点分别取卡片/胶囊边缘交点，弧线不穿卡）
    const capsuleNodeId = capsuleIdx >= 0 ? graph.nodes[capsuleIdx].id : "question";
    const edgePoint = (from: Box, to: Box): { start: Point; end: Point } => {
      const cx = from.x + from.width / 2, cy = from.y + from.height / 2;
      const tx = to.x + to.width / 2, ty = to.y + to.height / 2;
      const onBox = (box: Box, px: number, py: number): Point => {
        const bx = box.x + box.width / 2, by = box.y + box.height / 2;
        const dx = px - bx, dy = py - by;
        if (dx === 0 && dy === 0) return { x: bx, y: by };
        const t = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy));
        return { x: bx + dx * t, y: by + dy * t };
      };
      return { start: onBox(from, tx, ty), end: onBox(to, cx, cy) };
    };
    boxes.forEach((box, i) => {
      if (isCapsuleNode(graph.nodes[i])) return;
      const { start, end } = edgePoint(box, capsule);
      const bend = (box.x + box.width / 2 < capsule.x + capsule.width / 2 ? 1 : -1) * 0.12;
      elements.push(curveArrow(`debate-link-${i}`, start, end, graph.nodes[i].id, capsuleNodeId, tokens, bend));
    });
  }
  if (layout === "evidence-tree") {
    const mindmap = graph.metadata?.mode === "summary";
    // 思维导图：根节点放在左右两列之间的走廊，垂直中心与分支列中心精确对齐
    // （与 positions() summary 分支共用 colTop=260 / 每列卡高+间距 的口径，密度变化也不漂移）
    const root = mindmap
      ? (() => {
          const stepGap = 80 * tokens.spacing;
          const colTop = 260;
          const colHeight = (members: Box[]) =>
            members.reduce((sum, box) => sum + box.height, 0) + Math.max(0, members.length - 1) * stepGap;
          const leftBoxes = boxes.filter((_, i) => i % 2 === 0);
          const rightBoxes = boxes.filter((_, i) => i % 2 === 1);
          const maxCol = Math.max(colHeight(leftBoxes), colHeight(rightBoxes), 130);
          return { x: CARD_W * tokens.cardScale + 170, y: colTop + (maxCol - 130) / 2, width: 340, height: 130 };
        })()
      : { x: 60, y: 260, width: 420, height: 130 };
    // 思维导图分支箭头必须指向卡片侧边缘中点：根在左右两列中间，箭头走水平
    // （通用 anchors() 会把上下错位的卡判成垂直连线，从卡片顶部穿入，视觉上压到上面的卡）
    const mindmapAnchor = (child: Box): { start: Point; end: Point } => {
      const rootCy = root.y + root.height / 2;
      const childCy = child.y + child.height / 2;
      return child.x >= root.x + root.width
        ? { start: { x: root.x + root.width, y: rootCy }, end: { x: child.x, y: childCy } }
        : { start: { x: root.x, y: rootCy }, end: { x: child.x + child.width, y: childCy } };
    };
    elements.unshift({ ...base("evidence-root", "ellipse", root, tokens), backgroundColor: tokens.palette.accentFill, strokeColor: tokens.palette.accentStroke }, text("evidence-root-text", root.x + 30, root.y + 35, wrap(graph.title, tokens.keyFindingSize, 360, 2), tokens.keyFindingSize, tokens.palette.accentStroke, 360, tokens));
    graph.nodes.slice(0, 12).forEach((node, i) => {
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
      const laneBox: Box = { x, y: 210, width: laneW, height: bottom - 210 + 16 };
      laneBoxes.push({ group, box: laneBox });
      const label = graph.groups[group]?.label ?? `第${group + 1}站`;
      elements.unshift(
        { ...base(`lane-${group}`, "rectangle", laneBox, tokens), backgroundColor: tokens.palette.fills[group % tokens.palette.fills.length], strokeColor: tokens.palette.strokes[group % tokens.palette.strokes.length], opacity: 55 },
        text(`lane-head-${group}`, x + 18, 230, wrap(`第${group + 1}站 · ${label}`, tokens.keyFindingSize, laneW - 36, 1), tokens.keyFindingSize, tokens.palette.strokes[group % tokens.palette.strokes.length], laneW - 36, tokens),
      );
    }
    // 阶段间曲线箭头（泳道间走廊内，旧路线图同款微弯）
    for (let k = 0; k < laneBoxes.length - 1; k++) {
      const a = laneBoxes[k].box, b = laneBoxes[k + 1].box;
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
