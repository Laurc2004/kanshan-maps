import type { KnowledgeGraph } from "./harness/types";
import { knowledgeGraphToScene } from "./harness/layouts";
import { roadmapToKnowledgeGraph, viewpointToKnowledgeGraph } from "./harness/compat";
import type { ViewpointGraph } from "./viewpoints";
import type { RoadmapGraph } from "./roadmap";

// ─────────────────────────────────────────────
// 手绘感布局引擎 v2（防层叠版）
// 核心原则：
// 1. 文本预折行：Excalidraw 自由文本 autoResize 不换行，必须按卡宽手动插 \n
// 2. 卡高由内容行数动态计算，绝不写死
// 3. 确定性网格/列布局：卡位由构造保证不重叠（而非碰运气）
// 4. 旋转 ≤±1°，只做点缀不破坏文本对齐
// ─────────────────────────────────────────────

const STANCE_FILLS = ["#e7f5ff", "#f3f0ff", "#fff4e6", "#ffe3e3"];
const STANCE_STROKES = ["#339af0", "#845ef7", "#f76707", "#e03131"];
const CONSENSUS_FILL = "#ebfbee";
const CONSENSUS_STROKE = "#40c057";
const TITLE_COLOR = "#1a1a1a";
const MUTED = "#757575";

function palette(style: ViewpointGraph["style"] = "default") {
  if (style === "monochrome") return { fills: ["#f1f3f5", "#e9ecef", "#dee2e6", "#ced4da"], strokes: ["#343a40", "#495057", "#343a40", "#495057"], consensusFill: "#f1f3f5", consensusStroke: "#495057", title: "#212529", muted: "#868e96" };
  if (style === "pastel") return { fills: ["#e8f7ff", "#fff0f6", "#fff9db", "#ebfbee"], strokes: ["#74c0fc", "#f783ac", "#fcc419", "#69db7c"], consensusFill: "#ebfbee", consensusStroke: "#69db7c", title: "#343a40", muted: "#868e96" };
  if (style === "bold") return { fills: ["#d0ebff", "#e5dbff", "#ffe8cc", "#ffc9c9"], strokes: ["#1971c2", "#6741d9", "#d9480f", "#c92a2a"], consensusFill: "#d3f9d8", consensusStroke: "#2f9e44", title: "#212529", muted: "#495057" };
  return { fills: STANCE_FILLS, strokes: STANCE_STROKES, consensusFill: CONSENSUS_FILL, consensusStroke: CONSENSUS_STROKE, title: TITLE_COLOR, muted: MUTED };
}

let uid = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${uid++}`;
const rad = (deg: number) => (deg * Math.PI) / 180;

type El = Record<string, unknown>;

// 文本宽度估算：CJK 字宽 ≈ fontSize，ASCII ≈ fontSize*0.55（手写体近似）
function textWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? fontSize : fontSize * 0.55;
  }
  return w;
}

// 预折行：按 maxWidth 把长文本切成多行（返回 {text 带换行, lines 行数}）
function wrapText(s: string, fontSize: number, maxWidth: number, maxLines = 8): { text: string; lines: number } {
  const paras = s.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const para of paras) {
    if (para === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const ch of para) {
      if (textWidth(line + ch, fontSize) > maxWidth && line.length > 0) {
        out.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) out.push(line);
  }
  const lines = out.slice(0, maxLines);
  if (out.length > maxLines && lines.length > 0) {
    // 末行截断加省略号
    let last = lines[maxLines - 1];
    if (textWidth(last + "…", fontSize) > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return { text: lines.join("\n"), lines: lines.length };
}

const LINE_H = 1.25; // Excalidraw text lineHeight

function finalize(els: El[]): El[] {
  let i = 0;
  return els
    .filter((e) => e !== undefined && e !== null)
    .map((e) => ({
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      angle: 0,
      groupIds: [],
      frameId: null,
      link: null,
      locked: false,
      updated: 1,
      ...e,
      seed: 100000 + ((uid * 48271 + i * 7919) % 900000),
      version: 1,
      versionNonce: (uid * 31 + i) % 2147483647,
      index: "a" + String(i++).padStart(4, "0"),
    }));
}

// 多行自由文本：高度按行数算准
function block(
  x: number,
  y: number,
  maxW: number,
  text: string,
  fontSize: number,
  color: string,
  align: "left" | "center" = "left",
  maxLines = 8,
): { el: El; height: number } {
  const { text: wrapped, lines } = wrapText(text, fontSize, maxW, maxLines);
  const w = Math.min(maxW, Math.max(...wrapped.split("\n").map((l) => textWidth(l, fontSize)), 40));
  const h = lines * fontSize * LINE_H;
  return {
    el: {
      type: "text",
      id: nid("txt"),
      x,
      y,
      width: w,
      height: h,
      text: wrapped,
      fontSize,
      fontFamily: 5,
      strokeColor: color,
      originalText: wrapped,
      autoResize: true,
      textAlign: align,
      lineHeight: LINE_H,
    },
    height: h,
  };
}

function card(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  opts: { angle?: number; strokeWidth?: number } = {},
): El {
  return {
    type: "rectangle",
    id: nid("card"),
    x,
    y,
    width: w,
    height: h,
    roundness: { type: 3 },
    backgroundColor: fill,
    fillStyle: "solid",
    strokeColor: stroke,
    strokeWidth: opts.strokeWidth ?? 2,
    angle: opts.angle ?? 0,
  };
}

// 三点曲线箭头
function curveArrow(x1: number, y1: number, x2: number, y2: number, color: string, bend = 0, strokeWidth = 2): El {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * len * bend;
  const oy = (dx / len) * len * bend;
  return {
    type: "arrow",
    id: nid("arrow"),
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    points: [
      [0, 0],
      [mx - x1 + ox, my - y1 + oy],
      [x2 - x1, y2 - y1],
    ],
    endArrowhead: "arrow",
    strokeColor: color,
    strokeWidth,
    roundness: { type: 2 },
    outline: "outlineStyle_default",
    startArrowhead: null,
  };
}

// 矩形中心→目标方向的边框交点
function edgePoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number): [number, number] {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx === 0 ? Infinity : w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : h / 2 / Math.abs(dy);
  const t = Math.min(sx, sy);
  return [cx + dx * t, cy + dy * t];
}

// ─────────────────────────────────────────────
// 观点对照图：中心问题 + 2×2 网格立场卡（列内垂直堆叠，构造性防重叠）
// ─────────────────────────────────────────────
export function graphToScene(g: ViewpointGraph, followedAuthors: Set<string> = new Set()): El[] {
  const els: El[] = [];
  uid = 0;
  const colors = palette(g.style);
  const CARD_W = 460; // 内文本宽 = 460 - 44 padding
  const TEXT_W = CARD_W - 44;
  const COL_GAP = 160; // 中间箭头走廊
  const ROW_GAP = 60;
  const X0 = 70;
  const TITLE_Y = 24;

  // 标题（可折两行）
  const title = block(X0, TITLE_Y, 1000, g.question, 32, colors.title, "left", 2);
  els.push(title.el);

  // 中心问题胶囊：位于两列之间走廊上方
  const qW = 300;
  const qText = `Q · ${g.question.slice(0, 16)}${g.question.length > 16 ? "…" : ""}`;
  const qWrap = wrapText(qText, 18, qW - 36, 2);
  const qH = Math.max(72, qWrap.lines * 18 * LINE_H + 34);
  const W = X0 * 2 + CARD_W * 2 + COL_GAP;
  const qX = (W - qW) / 2;
  const qY = TITLE_Y + 90;
  els.push(card(qX, qY, qW, qH, "#fff3bf", "#fab005", { angle: rad(-0.6), strokeWidth: 2.5 }));
  els.push({
    ...block(qX + 18, qY + 16, qW - 36, qText, 18, "#8a6d00", "center", 2).el,
    // 居中手动放
  });

  // 先算每张卡的内容（得到精确高度），再定位
  const vs = g.viewpoints.slice(0, 4);
  const cards = vs.map((v, i) => {
    const followed = v.authors.some((a) => followedAuthors.has(a));
    const stanceT = block(0, 0, TEXT_W, `${followed ? "★ " : ""}${v.stance}`, 21, colors.strokes[i % 4], "left", 1);
    const authorsT = block(0, 0, TEXT_W, v.authors.slice(0, 3).join(" · "), 13, colors.muted, "left", 1);
    const summaryT = block(0, 0, TEXT_W, v.summary, 14, colors.title, "left", 4);
    const evidences = (v.evidence ?? []).slice(0, 2).map((ev) => block(0, 0, TEXT_W - 14, `· ${ev}`, 12, colors.muted, "left", 2));
    const inner =
      18 + stanceT.height + 6 + authorsT.height + 10 + summaryT.height + 10 +
      evidences.reduce((a, e) => a + e.height + 4, 0) + 18;
    return { v, i, followed, stanceT, authorsT, summaryT, evidences, height: Math.max(200, inner) };
  });

  // 2×2 网格：左列 0/2，右列 1/3；列内垂直堆叠
  const positions: { x: number; y: number; w: number; h: number }[] = [];
  const colHeights = [0, 0];
  cards.forEach((c, i) => {
    const col = i % 2;
    const x = X0 + col * (CARD_W + COL_GAP);
    const y = qY + qH + 80 + colHeights[col];
    positions.push({ x, y, w: CARD_W, h: c.height });
    colHeights[col] += c.height + ROW_GAP;
  });

  const maxY = Math.max(...positions.map((p) => p.y + p.h), qY + qH);

  cards.forEach((c, i) => {
    const p = positions[i];
    const stroke = colors.strokes[i % 4];
    const fill = colors.fills[i % 4];
    const tilt = rad(i % 2 === 0 ? 0.5 : -0.5);

    els.push(card(p.x, p.y, p.w, p.h, fill, stroke, { angle: tilt, strokeWidth: i === 0 ? 2.5 : 2 }));

    let cy = p.y + 18;
    els.push({ ...c.stanceT.el, x: p.x + 22, y: cy });
    cy += c.stanceT.height + 6;
    els.push({ ...c.authorsT.el, x: p.x + 22, y: cy });
    cy += c.authorsT.height + 10;
    els.push({ ...c.summaryT.el, x: p.x + 22, y: cy });
    cy += c.summaryT.height + 10;
    c.evidences.forEach((e) => {
      els.push({ ...e.el, x: p.x + 30, y: cy });
      cy += e.height + 4;
    });

    // 曲线箭头：卡片内缘 → 问题胶囊（左右方向明确，不交叉）
    const ccx = p.x + p.w / 2;
    const ccy = p.y + p.h / 2;
    const [sx, sy] = edgePoint(ccx, ccy, p.w + 16, p.h + 16, W / 2, qY + qH / 2);
    const [ex, ey] = edgePoint(W / 2, qY + qH / 2, qW + 24, qH + 24, ccx, ccy);
    els.push(curveArrow(sx, sy, ex, ey, stroke, (i % 2 === 0 ? 1 : -1) * 0.12, 2));
  });

  // 共识条：全部卡片下方通栏
  if (g.consensus.length > 0) {
    const cy0 = maxY + 90;
    const cItems = g.consensus.slice(0, 4).map((c, i) => block(0, 0, W - 360, `${i + 1}. ${c}`, 13, colors.consensusStroke, "left", 1));
    const cH = Math.max(64, 18 + cItems.reduce((a, e) => a + e.height + 6, 0) + 14);
    els.push(card(X0, cy0, W - X0 * 2, cH, colors.consensusFill, colors.consensusStroke, { angle: rad(0.4) }));
    const label = block(X0 + 24, cy0 + 18, 80, "共识", 20, colors.consensusStroke, "left", 1);
    els.push(label.el);
    let ly = cy0 + 16;
    cItems.forEach((e) => {
      els.push({ ...e.el, x: X0 + 130, y: ly });
      ly += e.height + 6;
    });
    // 问题→共识 单根绿箭头
    els.push(curveArrow(W / 2, qY + qH + 6, W / 2, cy0 - 6, colors.consensusStroke, 0, 2));
  }

  // 来源脚注
  const srcs = vs.flatMap((v) => v.sources).slice(0, 6);
  if (srcs.length > 0) {
    const sy = maxY + 90 + (g.consensus.length > 0 ? Math.max(64, 18 + g.consensus.slice(0, 4).length * (13 * LINE_H + 6) + 14) + 40 : 20);
    els.push(
      block(X0, sy, 1200, srcs.map((s, i) => `[${i + 1}] ${s}`).join("\n"), 11, MUTED, "left", 6).el,
    );
  }

  return finalize(els);
}

// ─────────────────────────────────────────────
// 学习路线图：泳道横排（同版式：动态卡高+预折行，构造防重叠）
// ─────────────────────────────────────────────
export function roadmapToScene(g: RoadmapGraph): El[] {
  const els: El[] = [];
  uid = 0;

  const LANE_W = 300;
  const GAP = 110;
  const X0 = 80;
  const Y0 = 150;
  const NODE_W = LANE_W - 32;
  const NODE_TEXT_W = NODE_W - 24;

  const title = block(X0 - 16, 24, 1000, `${g.topic} · 学习路线`, 32, TITLE_COLOR, "left", 2);
  els.push(title.el);

  const stages = g.stages.slice(0, 4);
  const lanes: { x: number; y: number; w: number; h: number }[] = [];

  stages.forEach((stage, si) => {
    const x = X0 + si * (LANE_W + GAP);
    const fill = STANCE_FILLS[si % STANCE_FILLS.length];
    const stroke = STANCE_STROKES[si % STANCE_STROKES.length];

    // 阶段标题
    const headT = block(0, 0, LANE_W - 36, `第${si + 1}站 · ${stage.title}`, 19, stroke, "left", 1);

    // 节点：先算内容高度
    const items = stage.items.slice(0, 4).map((it) => {
      const topicT = block(0, 0, NODE_TEXT_W, it.topic, 15, TITLE_COLOR, "left", 1);
      const detailT = block(0, 0, NODE_TEXT_W, it.detail, 12, MUTED, "left", 3);
      const srcT = it.source ? block(0, 0, NODE_TEXT_W, "→ 原帖", 11, stroke, "left", 1) : null;
      const h = 14 + topicT.height + 4 + detailT.height + (srcT ? srcT.height + 2 : 0) + 12;
      return { it, topicT, detailT, srcT, h: Math.max(86, h) };
    });

    const NODE_GAP = 20;
    const laneH = 20 + headT.height + 10 + items.reduce((a, n) => a + n.h + NODE_GAP, 0) + 6;
    lanes.push({ x, y: Y0, w: LANE_W, h: laneH });

    els.push(card(x, Y0, LANE_W, laneH, fill, stroke, { angle: rad(si % 2 === 0 ? 0.4 : -0.4) }));
    els.push({ ...headT, x: x + 18, y: Y0 + 20 });

    let ny = Y0 + 20 + headT.height + 10;
    items.forEach((n) => {
      const nodeEl = card(x + 16, ny, NODE_W, n.h, "#ffffff", stroke);
      if (n.it.source) nodeEl.link = n.it.source;
      els.push(nodeEl);
      let iy = ny + 12;
      els.push({ ...n.topicT.el, x: x + 28, y: iy });
      iy += n.topicT.height + 4;
      els.push({ ...n.detailT.el, x: x + 28, y: iy });
      iy += n.detailT.height;
      if (n.srcT) els.push({ ...n.srcT.el, x: x + 28, y: iy + 2 });
      ny += n.h + NODE_GAP;
    });
  });

  // 阶段间曲线箭头（水平走廊 GAP 内，无遮挡）
  for (let si = 0; si < lanes.length - 1; si++) {
    const a = lanes[si];
    const b = lanes[si + 1];
    els.push(curveArrow(a.x + a.w + 8, a.y + 90, b.x - 8, b.y + 90, "#868e96", si % 2 === 0 ? 0.1 : -0.1, 2.5));
  }

  return finalize(els);
}

/** Render unified graphs while preserving the legacy renderers above. */
export function knowledgeGraphScene(graph: KnowledgeGraph): El[] {
  return knowledgeGraphToScene(graph) as El[];
}

export function adaptiveGraphToScene(graph: KnowledgeGraph | ViewpointGraph | RoadmapGraph, followedAuthors: Set<string> = new Set()): El[] {
  if ("presentation" in graph && "nodes" in graph) return knowledgeGraphScene(graph as KnowledgeGraph);
  if ("stages" in graph) return roadmapToScene(graph as RoadmapGraph);
  return graphToScene(graph as ViewpointGraph, followedAuthors);
}

export { roadmapToKnowledgeGraph, viewpointToKnowledgeGraph };
