import type { ViewpointGraph } from "./viewpoints";
import type { RoadmapGraph } from "./roadmap";

// ─────────────────────────────────────────────
// 手绘感布局引擎
// 观点图：问题居中，立场卡呈放射状散布（角度/大小/旋转带微扰），曲线箭头
// 路线图：驿站式蜿蜒路径，阶段上下起伏，曲线箭头串联
// ─────────────────────────────────────────────

const STANCE_FILLS = ["#e7f5ff", "#f3f0ff", "#fff4e6", "#ffe3e3"];
const STANCE_STROKES = ["#339af0", "#845ef7", "#f76707", "#e03131"];
const CONSENSUS_FILL = "#ebfbee";
const CONSENSUS_STROKE = "#40c057";
const TITLE_COLOR = "#1a1a1a";
const MUTED = "#757575";

let uid = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${uid++}`;
const rad = (deg: number) => (deg * Math.PI) / 180;

type El = Record<string, unknown>;

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
    fontFamily: 5, // 手写中文
    strokeColor: color,
    originalText: text,
    autoResize: true,
    textAlign: align,
    lineHeight: 1.25,
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

// 三点曲线箭头：bend 为弯曲强度（正负交替让箭头扇形散开）
function curveArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  bend = 0,
  strokeWidth = 2,
): El {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // 法线方向偏移
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

// 从矩形中心指向目标方向，求矩形边框上的交点（箭头锚点）
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
// 观点对照图：放射状手绘布局
// ─────────────────────────────────────────────
export function graphToScene(g: ViewpointGraph, followedAuthors: Set<string> = new Set()): El[] {
  const els: El[] = [];
  uid = 0;

  const W = 1560;
  const cx0 = W / 2;
  const qy = 180;

  // 标题（左上，手写大字）
  els.push(freeText(64, 28, W - 128, 48, g.question, 34, TITLE_COLOR));

  // 中心问题胶囊
  const qW = Math.min(460, 220 + g.question.length * 16);
  const qH = 88;
  els.push(card(cx0 - qW / 2, qy, qW, qH, "#fff3bf", "#fab005", { angle: rad(-0.8), strokeWidth: 2.5 }));
  els.push(
    freeText(
      cx0 - qW / 2 + 20,
      qy + 22,
      qW - 40,
      48,
      `Q · ${g.question.slice(0, 22)}${g.question.length > 22 ? "…" : ""}`,
      20,
      "#8a6d00",
      "center",
    ),
  );

  const vs = g.viewpoints.slice(0, 4);
  const n = vs.length;

  // 放射角：从左下到右下扇形散布（度数以问题为中心，向下为正）
  const fanAngles: number[] =
    n === 1
      ? [265]
      : n === 2
        ? [215, 325]
        : n === 3
          ? [210, 268, 330]
          : [204, 246, 294, 336];

  // 半径与卡片尺寸微扰：主立场更大
  const layout = vs.map((_, i) => {
    const primary = i === 0;
    const ang = rad(fanAngles[i]);
    const r = primary ? 470 : 440 + (i % 2) * 36;
    const cw = (primary ? 470 : 424) - (n === 4 && !primary ? 24 : 0);
    const ch = primary ? 252 : 226 - (i % 2) * 12;
    return {
      ang,
      cx: cx0 + Math.cos(ang) * r,
      cy: qy + 60 + Math.abs(Math.sin(ang)) * (primary ? 430 : 470),
      cw,
      ch,
      tilt: rad((i % 2 === 0 ? 1 : -1) * (1.2 + (i % 3) * 0.9)), // 卡片轻微旋转 ±1°~4°
    };
  });

  layout.forEach((L, i) => {
    const v = vs[i];
    const fill = STANCE_FILLS[i % STANCE_FILLS.length];
    const stroke = STANCE_STROKES[i % STANCE_STROKES.length];
    const followed = v.authors.some((a) => followedAuthors.has(a));
    const { cx, cy, cw, ch, tilt } = L;

    els.push(card(cx - cw / 2, cy - ch / 2, cw, ch, fill, stroke, { angle: tilt, strokeWidth: i === 0 ? 2.5 : 2 }));

    // 立场标签（大字）+ 作者行 + 摘要 + 论据（文本保持水平，卡片微旋形成手绘感）
    els.push(freeText(cx - cw / 2 + 22, cy - ch / 2 + 16, cw - 44, 30, `${followed ? "★ " : ""}${v.stance}`, 22, stroke));
    els.push(freeText(cx - cw / 2 + 22, cy - ch / 2 + 54, cw - 44, 22, v.authors.slice(0, 3).join(" · "), 13, MUTED));
    els.push(freeText(cx - cw / 2 + 22, cy - ch / 2 + 84, cw - 44, 84, v.summary.slice(0, 90), 14, "#343a40"));
    (v.evidence ?? []).slice(0, 2).forEach((ev, ei) => {
      els.push(
        freeText(cx - cw / 2 + 22, cy - ch / 2 + 168 + ei * 30, cw - 44, 26, `· ${ev.slice(0, 40)}`, 12, "#495057"),
      );
    });

    // 曲线箭头：卡片边框 → 问题胶囊边框，弯曲方向交替
    const [sx, sy] = edgePoint(cx, cy, cw + 16, ch + 16, cx0, qy + qH / 2);
    const [ex, ey] = edgePoint(cx0, qy + qH / 2, qW + 24, qH + 24, cx, cy);
    els.push(curveArrow(sx, sy, ex, ey, stroke, (i % 2 === 0 ? 1 : -1) * 0.14, 2));
  });

  // 共识：底部横条，绿曲线箭头从各卡片汇入（左右位置单调对应，不会交叉）
  const bottom = Math.max(...layout.map((L) => L.cy + L.ch / 2), qy + qH);
  if (g.consensus.length > 0) {
    const cy0 = bottom + 110;
    const cH = 56 + Math.min(g.consensus.length, 4) * 30;
    els.push(card(90, cy0, W - 180, cH, CONSENSUS_FILL, CONSENSUS_STROKE, { angle: rad(0.5) }));
    els.push(freeText(116, cy0 + 16, 100, 28, "共识", 20, "#2b8a3e"));
    g.consensus.slice(0, 4).forEach((c, i) => {
      els.push(freeText(230, cy0 + 16 + i * 28, W - 340, 24, `${i + 1}. ${c.slice(0, 60)}`, 13, "#2b8a3e"));
    });
    layout.forEach((L, i) => {
      const [sx, sy] = edgePoint(L.cx, L.cy, L.cw + 16, L.ch + 16, L.cx, cy0 + 20);
      const tx = cx0 + (L.cx - cx0) * 0.6;
      els.push(curveArrow(sx, sy, tx, cy0 - 4, CONSENSUS_STROKE, (i % 2 === 0 ? -1 : 1) * 0.12, 1.5));
    });
  }

  // 来源脚注
  const srcs = vs.flatMap((v) => v.sources).slice(0, 6);
  if (srcs.length > 0) {
    const sy0 = bottom + 110 + (g.consensus.length > 0 ? 56 + Math.min(g.consensus.length, 4) * 30 + 46 : 20);
    els.push(
      freeText(64, sy0, W - 128, 20 + srcs.length * 18, srcs.map((s, i) => `[${i + 1}] ${s}`).join("\n"), 11, MUTED),
    );
  }

  return finalize(els);
}

// ─────────────────────────────────────────────
// 学习路线图：驿站式蜿蜒路径
// ─────────────────────────────────────────────
export function roadmapToScene(g: RoadmapGraph): El[] {
  const els: El[] = [];
  uid = 0;

  const LANE_W = 300;
  const GAP = 110;
  const X0 = 80;
  const BASE_Y = 210; // 基线（第一站中心 Y）
  const NODE_H = 110;
  const NODE_GAP = 20;
  const stages = g.stages.slice(0, 4);
  const W = X0 + stages.length * (LANE_W + GAP) + 40;

  els.push(freeText(64, 28, W - 128, 48, `${g.topic} · 学习路线`, 34, TITLE_COLOR));

  // 上下起伏的驿站位置（第 1、3 站靠上，2、4 站下沉，形成蜿蜒感）
  const wave = [0, 170, 60, 230];

  const centers: { x: number; y: number; h: number }[] = [];

  stages.forEach((stage, si) => {
    const x = X0 + si * (LANE_W + GAP);
    const items = stage.items.slice(0, 4);
    const laneH = 70 + items.length * (NODE_H + NODE_GAP) + 16;
    const cy = BASE_Y + wave[si % wave.length] + laneH / 2;
    centers.push({ x: x + LANE_W / 2, y: cy, h: laneH });

    const fill = STANCE_FILLS[si % STANCE_FILLS.length];
    const stroke = STANCE_STROKES[si % STANCE_STROKES.length];

    els.push(card(x, cy - laneH / 2, LANE_W, laneH, fill, stroke, { angle: rad(si % 2 === 0 ? 0.6 : -0.6) }));
    els.push(freeText(x + 18, cy - laneH / 2 + 14, LANE_W - 36, 30, `第${si + 1}站 · ${stage.title}`, 19, stroke));

    items.forEach((it, ii) => {
      const ny = cy - laneH / 2 + 58 + ii * (NODE_H + NODE_GAP);
      const nodeEl = card(x + 16, ny, LANE_W - 32, NODE_H, "#ffffff", stroke);
      if (it.source) nodeEl.link = it.source;
      els.push(nodeEl);
      els.push(freeText(x + 28, ny + 12, LANE_W - 56, 24, it.topic.slice(0, 20), 15, TITLE_COLOR));
      els.push(freeText(x + 28, ny + 40, LANE_W - 56, 56, it.detail.slice(0, 48), 12, MUTED));
      if (it.source) {
        els.push(freeText(x + 28, ny + NODE_H - 22, LANE_W - 56, 18, "→ 原帖", 11, stroke));
      }
    });
  });

  // 阶段间曲线箭头：上一站右缘 → 下一站左缘，弯曲方向随起伏变化
  for (let si = 0; si < centers.length - 1; si++) {
    const a = centers[si];
    const b = centers[si + 1];
    const down = b.y > a.y;
    els.push(
      curveArrow(
        a.x + LANE_W / 2 + 8,
        a.y,
        b.x - LANE_W / 2 - 8,
        b.y,
        "#868e96",
        down ? 0.16 : -0.16,
        2.5,
      ),
    );
  }

  return finalize(els);
}
