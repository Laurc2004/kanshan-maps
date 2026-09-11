import type { ViewpointGraph } from "./viewpoints";
import type { RoadmapGraph } from "./roadmap";

// 调色板（柔和浅色填充 + 深色描边，避免塑料感）
const STANCE_FILLS = ["#e7f5ff", "#f3f0ff", "#fff4e6", "#ffe3e3"];
const STANCE_STROKES = ["#339af0", "#845ef7", "#f76707", "#e03131"];
const CONSENSUS_FILL = "#ebfbee";
const CONSENSUS_STROKE = "#40c057";
const TITLE_COLOR = "#1a1a1a";
const MUTED = "#757575";

let uid = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${uid++}`;

type El = Record<string, unknown>;

// Excalidraw 0.18 元素必需字段补全（缺 seed/version/index 会被 updateScene 静默丢弃）
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
      seed: 100000 + ((uid * 7919) % 900000),
      version: 1,
      versionNonce: (uid * 31) % 2147483647,
      index: "a" + String(i++).padStart(4, "0"),
    }));
}

// 自由文本（无容器）
function freeText(
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fontSize: number,
  color: string,
  align: "left" | "center" = "left",
): El {
  return {
    type: "text",
    id: nid("txt"),
    x,
    y,
    width: w,
    height: h,
    text,
    fontSize,
    fontFamily: 5, // 5 = Excalifont + Xiaolai（手写中文），3 是 Cascadia 等宽（错）
    strokeColor: color,
    originalText: text,
    autoResize: true,
    textAlign: align,
    lineHeight: 1.25,
  };
}

// 圆角卡片：矩形 + 多个独立文本行（不塞进容器，避免堆字）
function card(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
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
  };
}

function arrow(x1: number, y1: number, x2: number, y2: number, color = "#1e1e1e"): El {
  return {
    type: "arrow",
    id: nid("arrow"),
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    points: [
      [0, 0],
      [x2 - x1, y2 - y1],
    ],
    endArrowhead: "arrow",
    strokeColor: color,
  };
}

// ─────────────────────────────────────────────
// 观点对照图：中心问题 + 左右分歧卡 + 底部共识条
// ─────────────────────────────────────────────
export function graphToScene(g: ViewpointGraph, followedAuthors: Set<string> = new Set()): El[] {
  const els: El[] = [];
  uid = 0;

  const W = 1200; // 画布逻辑宽度
  const CARD_W = 460;
  const GAP = 40;

  // 标题
  els.push(freeText(60, 24, W - 120, 44, g.question, 30, TITLE_COLOR));

  // 中心问题胶囊
  const qW = 340;
  const qX = (W - qW) / 2;
  const qY = 110;
  els.push(card(qX, qY, qW, 76, "#fff3bf", "#fab005"));
  els.push(
    freeText(qX + 16, qY + 14, qW - 32, 48, `Q · ${g.question.slice(0, 22)}${g.question.length > 22 ? "…" : ""}`, 18, "#8a6d00", "center"),
  );

  // 分歧阵营：两列，从中心向两侧排
  const vs = g.viewpoints.slice(0, 4);
  const rows = Math.ceil(vs.length / 2);
  vs.forEach((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col === 0 ? 60 : 60 + CARD_W + GAP + 120; // 中间留 120 给箭头走廊
    const y = 240 + row * 300;
    const fill = STANCE_FILLS[i % STANCE_FILLS.length];
    const stroke = STANCE_STROKES[i % STANCE_STROKES.length];
    const followed = v.authors.some((a) => followedAuthors.has(a));

    els.push(card(x, y, CARD_W, 240, fill, stroke));
    // 立场标签行
    els.push(
      freeText(
        x + 20,
        y + 16,
        CARD_W - 40,
        28,
        `${followed ? "★ " : ""}${v.stance}`,
        20,
        stroke,
      ),
    );
    // 作者行
    els.push(
      freeText(
        x + 20,
        y + 52,
        CARD_W - 40,
        22,
        v.authors.slice(0, 3).join(" · "),
        13,
        MUTED,
      ),
    );
    // 摘要
    els.push(
      freeText(x + 20, y + 82, CARD_W - 40, 80, v.summary.slice(0, 90), 14, "#343a40"),
    );
    // 论据
    (v.evidence ?? []).slice(0, 2).forEach((ev, ei) => {
      els.push(
        freeText(
          x + 20,
          y + 168 + ei * 30,
          CARD_W - 40,
          26,
          `· ${ev.slice(0, 40)}`,
          12,
          "#495057",
        ),
      );
    });

    // 箭头：从卡片内缘指向问题胶囊
    const fromX = col === 0 ? x + CARD_W : x;
    const fromY = y + 60;
    const toX = col === 0 ? qX : qX + qW;
    const toY = qY + qW / 2;
    els.push(arrow(fromX, fromY, toX, toY, stroke));
  });

  // 共识条：底部通栏
  if (g.consensus.length > 0) {
    const cy = 240 + rows * 300 + 30;
    els.push(card(60, cy, W - 120, 56 + g.consensus.length * 30, CONSENSUS_FILL, CONSENSUS_STROKE));
    els.push(freeText(80, cy + 14, 120, 26, "共识", 18, "#2b8a3e"));
    g.consensus.slice(0, 4).forEach((c, i) => {
      els.push(freeText(200, cy + 14 + i * 28, W - 280, 24, `${i + 1}. ${c.slice(0, 60)}`, 13, "#2b8a3e"));
    });
    // 从问题胶囊到共识条一根绿箭头
    els.push(arrow(qX + qW / 2, qY + 76, qX + qW / 2, cy, CONSENSUS_STROKE));
  }

  // 来源脚注
  const srcs = vs.flatMap((v) => v.sources).slice(0, 6);
  if (srcs.length > 0) {
    const sy = 240 + rows * 300 + 30 + (g.consensus.length > 0 ? 56 + g.consensus.length * 30 + 40 : 20);
    els.push(
      freeText(60, sy, W - 120, 20 + srcs.length * 18, srcs.map((s, i) => `[${i + 1}] ${s}`).join("\n"), 11, MUTED),
    );
  }

  return finalize(els);
}

// ─────────────────────────────────────────────
// 学习路线图：泳道式，阶段通栏横排、节点纵向
// ─────────────────────────────────────────────
export function roadmapToScene(g: RoadmapGraph): El[] {
  const els: El[] = [];
  uid = 0;

  const W = 1280;
  const LANE_W = 280;
  const LANE_GAP = 40;
  const X0 = 60;
  const Y0 = 130;
  const NODE_H = 110;
  const NODE_GAP = 22;

  els.push(freeText(X0, 24, W - 120, 44, `${g.topic} · 学习路线图`, 30, TITLE_COLOR));

  g.stages.slice(0, 4).forEach((stage, si) => {
    const x = X0 + si * (LANE_W + LANE_GAP);
    const fill = STANCE_FILLS[si % STANCE_FILLS.length];
    const stroke = STANCE_STROKES[si % STANCE_STROKES.length];

    // 泳道背景（淡色大框）
    const items = stage.items.slice(0, 4);
    const laneH = 70 + items.length * (NODE_H + NODE_GAP) + 20;
    els.push(card(x, Y0, LANE_W, laneH, fill, stroke));

    // 阶段标题
    els.push(freeText(x + 18, Y0 + 16, LANE_W - 36, 30, `${si + 1} · ${stage.title}`, 19, stroke));

    // 知识点节点：白底小卡
    items.forEach((it, ii) => {
      const ny = Y0 + 62 + ii * (NODE_H + NODE_GAP);
      const nodeEl = card(x + 16, ny, LANE_W - 32, NODE_H, "#ffffff", stroke);
      if (it.source) nodeEl.link = it.source;
      els.push(nodeEl);
      els.push(freeText(x + 28, ny + 12, LANE_W - 56, 24, it.topic.slice(0, 20), 15, TITLE_COLOR));
      els.push(freeText(x + 28, ny + 40, LANE_W - 56, 56, it.detail.slice(0, 48), 12, MUTED));
      if (it.source) {
        els.push(freeText(x + 28, ny + NODE_H - 22, LANE_W - 56, 18, "→ 原帖", 11, stroke));
      }
    });

    // 阶段间箭头
    if (si < Math.min(g.stages.length, 4) - 1) {
      const ay = Y0 + laneH / 2;
      els.push(arrow(x + LANE_W, ay, x + LANE_W + LANE_GAP, ay, "#868e96"));
    }
  });

  return finalize(els);
}
