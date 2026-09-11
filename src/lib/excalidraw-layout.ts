import type { ViewpointGraph } from "./viewpoints";

// 调色板：共识=绿，各分歧阵营=蓝/紫/橙/红
const STANCE_COLORS = ["#a5d8ff", "#d0bfff", "#ffd8a8", "#ffc9c9"];
const CONSENSUS_COLOR = "#b2f2bb";

let uid = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${uid++}`;

type El = Record<string, unknown>;

// Excalidraw 0.18 元素必需字段补全（缺 seed/version/index 会被 updateScene 静默丢弃）
function finalize(els: El[]): El[] {
  let i = 0;
  return els.filter((e) => e !== undefined && e !== null).map((e) => ({
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

function labeledRect(id: string, x: number, y: number, w: number, h: number, text: string, fill: string, fontSize = 16): El[] {
  const tid = `t_${id}`;
  return [
    {
      type: "rectangle", id, x, y, width: w, height: h,
      roundness: { type: 3 }, backgroundColor: fill, fillStyle: "solid",
      boundElements: [{ id: tid, type: "text" }],
    },
    {
      type: "text", id: tid, x: x + 8, y: y + 6, width: w - 16, height: h - 12,
      text, fontSize, fontFamily: 3, strokeColor: "#1e1e1e",
      textAlign: "center", verticalAlign: "middle",
      containerId: id, originalText: text, autoResize: true, lineHeight: 1.25,
    },
  ];
}

function arrow(from: string, to: string, x1: number, y1: number, x2: number, y2: number, label?: string): El[] {
  const id = nid("arrow");
  const els: El[] = [{
    type: "arrow", id, x: x1, y: y1, width: x2 - x1, height: y2 - y1,
    points: [[0, 0], [x2 - x1, y2 - y1]], endArrowhead: "arrow",
    startBinding: { elementId: from, fixedPoint: [0.5, 1], focus: 0, gap: 4 },
    endBinding: { elementId: to, fixedPoint: [0.5, 0], focus: 0, gap: 4 },
    boundElements: label ? [{ id: `t_${id}`, type: "text" }] : undefined,
  }];
  if (label) {
    els.push({
      type: "text", id: `t_${id}`, x: (x1 + x2) / 2 - 30, y: (y1 + y2) / 2 - 10,
      width: 60, height: 20, text: label, fontSize: 14, fontFamily: 3,
      strokeColor: "#5c5c5c", containerId: id, originalText: label, autoResize: true,
      textAlign: "center", verticalAlign: "middle",
    });
  }
  return els;
}

export function graphToScene(g: ViewpointGraph, followedAuthors: Set<string> = new Set()): El[] {
  let els: El[] = [];
  uid = 0;

  // 标题
  els.push({
    type: "text", id: nid("title"), x: 60, y: 20, width: 880, height: 40,
    text: g.question, fontSize: 28, fontFamily: 3, strokeColor: "#1e1e1e",
    originalText: g.question, autoResize: true, textAlign: "left",
  });

  // 中心问题节点
  const cx = 400, cy = 140;
  els.push(...labeledRect(nid("q"), cx, cy, 200, 80, `？\n${g.question.slice(0, 20)}`, "#fff3bf", 18));

  // 共识区（右上）
  if (g.consensus.length > 0) {
    const consId = nid("cons");
    els.push(...labeledRect(consId, 700, 90, 220, 60 + g.consensus.length * 30, `共识\n${g.consensus.map((c, i) => `${i + 1}. ${c}`).join("\n")}`, CONSENSUS_COLOR, 14));
    els.push(...arrow(consId, consId, 700, 120, 600, 160)); // placeholder replaced below
    els.pop(); els.pop(); // (skip arrow for now, keep layout simple)
  }

  // 分歧阵营（左侧竖排）
  const vs = g.viewpoints.slice(0, 4);
  vs.forEach((v, i) => {
    const id = nid(`v${i}`);
    const y = 280 + i * 170;
    const followed = v.authors.some((a) => followedAuthors.has(a));
    const label = `${followed ? "★ " : ""}${v.stance}｜${v.authors.join("、").slice(0, 24)}\n${v.summary}${v.evidence?.length ? `\n• ${v.evidence.slice(0, 3).join("\n• ")}` : ""}`;
    els.push(...labeledRect(id, 80, y, 420, 140, label, STANCE_COLORS[i % STANCE_COLORS.length], 15));
    els.push(...arrow(id, id, 290, y, 500, cy + 80));
  });

  // 来源注释
  const srcNote = vs.flatMap((v) => v.sources).slice(0, 8).map((s, i) => `[${i}] ${s}`).join("\n");
  els.push({
    type: "text", id: nid("src"), x: 560, y: 700, width: 700, height: 120,
    text: `原文链接：\n${srcNote}`, fontSize: 12, fontFamily: 3, strokeColor: "#757575",
    originalText: srcNote, autoResize: true, textAlign: "left",
  });

  return finalize(els);
}
