import type { KnowledgeGraph, KnowledgeNode, LayoutKind } from "./types";

export type SceneElement = Record<string, unknown>;
type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };

const CARD_W = 320;
const CARD_H = 176;
const TEXT_W = CARD_W - 40;
const LINE_HEIGHT = 1.25;

function safeId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "node";
  return `${sanitized}-${hash(value).toString(16).padStart(8, "0")}`;
}

function widthOf(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) width += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char) ? fontSize : fontSize * 0.55;
  return width;
}

function wrap(text: string, fontSize: number, maxWidth: number, maxLines: number): string {
  const lines: string[] = [];
  let line = "";
  for (const char of text.replace(/\s+/g, " ").trim()) {
    if (line && widthOf(line + char, fontSize) > maxWidth) { lines.push(line); line = char; } else line += char;
  }
  if (line) lines.push(line);
  const result = lines.slice(0, maxLines);
  if (lines.length > maxLines && result.length) result[result.length - 1] = `${result[result.length - 1].slice(0, -1)}…`;
  return result.join("\n");
}

function base(id: string, type: string, box: Box): SceneElement {
  return { id, type, ...box, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, index: null, roundness: type === "rectangle" ? { type: 3 } : null, seed: hash(id), version: 1, versionNonce: hash(`${id}-version`), isDeleted: false, boundElements: null, updated: 1, link: null, locked: false };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0) || 1;
}

function card(node: KnowledgeNode, box: Box, colorIndex: number): SceneElement[] {
  const fills = ["#e7f5ff", "#fff4e6", "#ebfbee", "#f3f0ff", "#fff0f6", "#fff9db"];
  const strokes = ["#1971c2", "#e8590c", "#2b8a3e", "#6741d9", "#c2255c", "#e67700"];
  const id = `node-${safeId(node.id)}`;
  const title = wrap(node.label, 20, TEXT_W, 2);
  const description = wrap(node.description, 14, TEXT_W, 5);
  return [
    { ...base(id, "rectangle", box), backgroundColor: fills[colorIndex % fills.length], strokeColor: strokes[colorIndex % strokes.length], strokeWidth: node.emphasis === "high" ? 3 : 2, link: node.citations[0] ?? null, customData: { nodeId: node.id } },
    text(`${id}-title`, box.x + 20, box.y + 20, title, 20, strokes[colorIndex % strokes.length]),
    text(`${id}-body`, box.x + 20, box.y + 66, description, 14, "#343a40"),
  ];
}

function text(id: string, x: number, y: number, value: string, fontSize: number, color: string): SceneElement {
  const lines = value.split("\n");
  const width = Math.min(420, Math.max(20, ...lines.map((line) => widthOf(line, fontSize))));
  return { ...base(id, "text", { x, y, width, height: Math.max(1, lines.length) * fontSize * LINE_HEIGHT }), text: value, originalText: value, fontSize, fontFamily: 5, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: LINE_HEIGHT, strokeColor: color };
}

function arrow(id: string, from: Point, to: Point, startNodeId: string, endNodeId: string): SceneElement {
  return { ...base(id, "arrow", { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y }), points: [[0, 0], [to.x - from.x, to.y - from.y]], lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow", elbowed: false, startNodeId, endNodeId };
}

function header(graph: KnowledgeGraph): SceneElement[] {
  return [text("graph-title", 60, 30, wrap(graph.title, 32, 420, 2), 32, "#1a1a1a"), ...(graph.summary ? [text("graph-summary", 60, 112, wrap(graph.summary, 15, 420, 3), 15, "#757575")] : [])];
}

function debateGrid(graph: KnowledgeGraph): SceneElement[] {
  const elements = header(graph);
  graph.nodes.forEach((node, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    elements.push(...card(node, { x: 60 + col * 440, y: 210 + row * 230, width: CARD_W, height: CARD_H }, col));
  });
  return elements;
}

function radialMap(graph: KnowledgeGraph): SceneElement[] {
  const elements = header(graph);
  const count = graph.nodes.length;
  const cx = 760, cy = 600, rx = 680, ry = 460;
  graph.nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(count, 1);
    const box = { x: cx + Math.cos(angle) * rx - CARD_W / 2, y: cy + Math.sin(angle) * ry - CARD_H / 2, width: CARD_W, height: CARD_H };
    elements.push(...card(node, box, i));
    elements.unshift(arrow(`radial-edge-${safeId(node.id)}`, { x: cx, y: cy }, { x: box.x + CARD_W / 2, y: box.y + CARD_H / 2 }, "center", node.id));
  });
  elements.push({ ...base("radial-center", "ellipse", { x: cx - 100, y: cy - 58, width: 200, height: 116 }), backgroundColor: "#fff3bf", strokeColor: "#e67700" }, text("radial-center-text", cx - 76, cy - 16, wrap(graph.title, 17, 152, 2), 17, "#8a4b00"));
  return elements;
}

function timeline(graph: KnowledgeGraph): SceneElement[] {
  const elements = header(graph);
  const boxes = graph.nodes.map((node, i) => ({ node, box: { x: 60 + i * 410, y: 270 + (i % 2) * 230, width: CARD_W, height: CARD_H } }));
  boxes.forEach(({ node, box }, i) => elements.push(...card(node, box, i)));
  for (let i = 0; i < boxes.length - 1; i++) {
    const current = boxes[i], next = boxes[i + 1];
    elements.push(arrow(`timeline-edge-${i}`, { x: current.box.x + CARD_W, y: current.box.y + CARD_H / 2 }, { x: next.box.x, y: next.box.y + CARD_H / 2 }, current.node.id, next.node.id));
  }
  return elements;
}

export const layoutRegistry: Partial<Record<LayoutKind, (graph: KnowledgeGraph) => SceneElement[]>> = { "debate-grid": debateGrid, "radial-map": radialMap, timeline };

export function knowledgeGraphToScene(graph: KnowledgeGraph): SceneElement[] {
  const requested = graph.presentation.layout ?? graph.kind;
  // Task 7 adds the remaining templates; valid unsupported layouts explicitly degrade to radial-map.
  return (layoutRegistry[requested] ?? radialMap)(graph);
}
