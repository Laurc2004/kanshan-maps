import test from "node:test";
import assert from "node:assert/strict";
import { knowledgeGraphToScene } from "./layouts.ts";
import type { KnowledgeGraph, LayoutKind } from "./types.ts";

const graph = (layout: LayoutKind): KnowledgeGraph => ({ kind: layout, title: "Technology through time", summary: "A compact overview", nodes: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `Step ${i + 1}`, description: "A deliberately long explanation that must wrap inside its deterministic card without becoming over-wide.", citations: [], group: i < 3 ? "g1" : "g2" })), edges: Array.from({ length: 5 }, (_, i) => ({ fromId: `n${i}`, toId: `n${i + 1}` })), groups: [{ id: "g1", label: "For", nodeIds: ["n0", "n1", "n2"] }, { id: "g2", label: "Against", nodeIds: ["n3", "n4", "n5"] }], citations: [], presentation: { layout, palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } } });

function substantiveCollisions(elements: Record<string, unknown>[]) {
  const boxes = elements.filter((e) => e.type === "rectangle").map((e) => e as { id: string; x: number; y: number; width: number; height: number });
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const containment = (a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height) || (b.x <= a.x && b.y <= a.y && b.x + b.width >= a.x + a.width && b.y + b.height >= a.y + a.height);
    if (!containment && intersection > Math.min(a.width * a.height, b.width * b.height) * 0.05) hits.push(`${a.id}:${b.id}`);
  }
  return hits;
}

for (const layout of ["debate-grid", "radial-map", "timeline"] as const) test(`${layout} produces a valid collision-free Excalidraw scene`, () => {
  const scene = knowledgeGraphToScene(graph(layout));
  assert.ok(scene.length > 0);
  for (const element of scene) {
    assert.equal(typeof element.id, "string"); assert.equal(typeof element.x, "number"); assert.equal(typeof element.y, "number");
    assert.equal(typeof element.width, "number"); assert.equal(typeof element.height, "number"); assert.equal(typeof element.seed, "number");
    if (element.type === "text") assert.ok((element.width as number) <= 420, `over-wide text ${element.id}`);
  }
  assert.deepEqual(substantiveCollisions(scene), []);
});

test("same IR produces structurally different layout scenes and honors presentation.layout", () => {
  const base = graph("debate-grid");
  const signatures = (["debate-grid", "radial-map", "timeline"] as const).map((layout) => knowledgeGraphToScene({ ...base, kind: "debate-grid", presentation: { ...base.presentation, layout } }).filter((e) => e.type === "rectangle").map((e) => `${e.x},${e.y}`).join("|"));
  assert.equal(new Set(signatures).size, 3);
});

test("kind selects layout when presentation.layout is absent", () => {
  const timeline = graph("timeline");
  timeline.presentation = { ...timeline.presentation, layout: undefined };
  const cards = knowledgeGraphToScene(timeline).filter((e) => e.type === "rectangle") as Array<{ x: number }>;
  assert.ok(cards.every((card, i) => i === 0 || card.x > cards[i - 1].x));
});

test("timeline arrows connect nodes in chronological left-to-right order", () => {
  const arrows = knowledgeGraphToScene(graph("timeline")).filter((e) => e.type === "arrow") as Array<{ x: number; width: number; startNodeId?: string; endNodeId?: string }>;
  assert.equal(arrows.length, 5);
  assert.ok(arrows.every((arrow, i) => arrow.width > 0 && arrow.startNodeId === `n${i}` && arrow.endNodeId === `n${i + 1}`));
});

test("node IDs remain unique for distinct non-BMP source IDs", () => {
  const ids = ["😀", "😁"];
  const scene = knowledgeGraphToScene({ ...graph("debate-grid"), nodes: ids.map((id) => ({ id, label: id, description: "node", citations: [] })) });
  const elementIds = scene.map((element) => element.id as string);
  assert.equal(new Set(elementIds).size, elementIds.length);
});

test("node IDs remain unique for sanitized and truncated source IDs", () => {
  const ids = ["a/b", "a?b", "a\\\\b", "x".repeat(90), "x".repeat(89) + "y"];
  const scene = knowledgeGraphToScene({ ...graph("debate-grid"), nodes: ids.map((id) => ({ id, label: id, description: "node", citations: [] })) });
  const elementIds = scene.map((element) => element.id as string);
  assert.equal(new Set(elementIds).size, elementIds.length);
});
