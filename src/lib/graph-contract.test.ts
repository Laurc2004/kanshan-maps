import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentGraph } from "./graph-contract.ts";

test("normalizes legacy viewpoint graph", () => {
  const graph = normalizeAgentGraph({ question: "Q", consensus: ["C"], viewpoints: [] });
  assert.equal(graph?.kind, "debate-grid");
  assert.equal(graph?.title, "Q");
});

test("normalizes legacy roadmap graph", () => {
  const graph = normalizeAgentGraph({ kind: "roadmap", topic: "T", stages: [{ title: "入门", items: [{ topic: "A", detail: "D" }] }] });
  assert.equal(graph?.kind, "swimlane-roadmap");
  assert.equal(graph?.nodes[0]?.label, "A");
});

test("keeps unified summary board graph", () => {
  const input = { kind: "cluster-board", title: "T", summary: "S", nodes: [], edges: [], groups: [], citations: [], presentation: { palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } } } as const;
  assert.equal(normalizeAgentGraph(input), input);
});

test("rejects missing or malformed graph data", () => {
  assert.equal(normalizeAgentGraph(null), null);
  assert.equal(normalizeAgentGraph({ kind: "roadmap", topic: "T" }), null);
});

test("legacy roadmap and viewpoint graphs are valid Agent inputs after JSON roundtrip", () => {
  for (const input of [
    { question: "Q", consensus: [], viewpoints: [] },
    { kind: "roadmap", topic: "T", stages: [{ title: "S", items: [{ topic: "A", detail: "D" }] }] },
  ]) {
    const graph = normalizeAgentGraph(JSON.parse(JSON.stringify(input)));
    assert.ok(graph);
    assert.ok(graph.nodes.every((node) => typeof node.id === "string"));
    assert.ok(graph.presentation);
  }
});
