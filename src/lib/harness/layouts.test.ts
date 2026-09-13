import test from "node:test";
import assert from "node:assert/strict";
import { knowledgeGraphToScene } from "./layouts.ts";
import type { KnowledgeGraph, LayoutKind } from "./types.ts";

const layouts = ["debate-grid", "radial-map", "timeline", "swimlane-roadmap", "cluster-board", "evidence-tree"] as const;
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

for (const layout of layouts) test(`${layout} produces a valid collision-free Excalidraw scene`, () => {
  const value = graph(layout);
  value.presentation = { ...value.presentation, density: "spacious", hierarchy: { title: 2, keyFinding: 2, evidence: 2 } };
  const scene = knowledgeGraphToScene(value);
  assert.ok(scene.length > 0);
  const byId = new Map(scene.map((element) => [element.id, element]));
  for (const element of scene) {
    assert.equal(typeof element.id, "string"); assert.equal(typeof element.x, "number"); assert.equal(typeof element.y, "number");
    assert.equal(typeof element.width, "number"); assert.equal(typeof element.height, "number"); assert.equal(typeof element.seed, "number");
    if (element.type === "text") {
      assert.ok((element.width as number) <= 420, `over-wide text ${element.id}`);
      const ownerId = (element.id as string).replace(/-(title|body)$/, "");
      const owner = byId.get(ownerId);
      if (owner) {
        assert.ok((element.x as number) + (element.width as number) <= (owner.x as number) + (owner.width as number), `text escapes card width ${element.id}`);
        assert.ok((element.y as number) + (element.height as number) <= (owner.y as number) + (owner.height as number), `text escapes card height ${element.id}`);
      }
    }
  }
  assert.deepEqual(substantiveCollisions(scene), []);
});

test("all layouts are structurally distinct and presentation.layout overrides kind", () => {
  const base = graph("debate-grid");
  const signatures = layouts.map((layout) => knowledgeGraphToScene({ ...base, kind: "debate-grid", presentation: { ...base.presentation, layout } }).filter((e) => e.type === "rectangle").map((e) => `${e.x},${e.y},${e.width},${e.height}`).join("|"));
  assert.equal(new Set(signatures).size, layouts.length);
});

test("unsupported layout falls back explicitly and deterministically", () => {
  const base = graph("debate-grid");
  const fallback = knowledgeGraphToScene({ ...base, presentation: { ...base.presentation, layout: "not-a-layout" as LayoutKind } });
  assert.deepEqual(fallback, knowledgeGraphToScene({ ...base, presentation: { ...base.presentation, layout: "radial-map" } }));
});

test("same graph produces the same scene IDs and geometry", () => assert.deepEqual(knowledgeGraphToScene(graph("cluster-board")), knowledgeGraphToScene(graph("cluster-board"))));

test("unassigned nodes occupy unique fallback slots and duplicate edges get unique IDs", () => {
  const value = graph("swimlane-roadmap");
  value.groups = [{ id: "g1", label: "One", nodeIds: ["n0"] }];
  value.nodes = value.nodes.map((node, i) => ({ ...node, group: i === 0 ? "g1" : undefined }));
  value.edges.push({ fromId: "n0", toId: "n1" });
  const scene = knowledgeGraphToScene(value);
  const rects = scene.filter((e) => e.type === "rectangle") as Array<{ x: number; y: number; width: number; height: number }>;
  assert.deepEqual(substantiveCollisions(scene), []);
  assert.equal(new Set(scene.filter((e) => e.type === "arrow").map((e) => e.id)).size, 6);
  assert.ok(rects.every((r) => r.width > 0 && r.height > 0));
});

test("hierarchy text stays inside cards at maximum supported scale", () => {
  const value = graph("debate-grid");
  value.presentation = { ...value.presentation, hierarchy: { title: 2, keyFinding: 2, evidence: 2 } };
  const scene = knowledgeGraphToScene(value);
  const byId = new Map(scene.map((element) => [element.id, element]));
  for (const element of scene.filter((e) => e.type === "text")) {
    const owner = byId.get((element.id as string).replace(/-(title|body)$/, ""));
    if (owner) {
      assert.ok((element.x as number) + (element.width as number) <= (owner.x as number) + (owner.width as number));
      assert.ok((element.y as number) + (element.height as number) <= (owner.y as number) + (owner.height as number));
    }
  }
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
