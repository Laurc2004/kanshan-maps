import test from "node:test";
import assert from "node:assert/strict";
import { roadmapToKnowledgeGraph, viewpointToKnowledgeGraph, knowledgeGraphToViewpoint, knowledgeGraphToRoadmap } from "./compat.ts";
import type { KnowledgeGraph } from "./types.ts";

test("converts legacy viewpoint graph to unified IR and back", () => {
  const legacy = { question: "Should we learn?", consensus: ["Practice matters"], viewpoints: [{ stance: "Yes", summary: "Build projects", evidence: ["Ship often"], authors: ["A"], sources: ["https://a.test"] }] as const };
  const graph = viewpointToKnowledgeGraph(legacy);
  assert.equal(graph.kind, "debate-grid");
  assert.equal(graph.title, legacy.question);
  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(knowledgeGraphToViewpoint(graph), legacy);
});

test("converts roadmap graph to unified IR and back", () => {
  const legacy = { kind: "roadmap" as const, topic: "TypeScript", stages: [{ title: "Start", items: [{ topic: "Types", detail: "Model data", source: "https://a.test" }] }] };
  const graph = roadmapToKnowledgeGraph(legacy);
  assert.equal(graph.kind, "swimlane-roadmap");
  assert.equal(graph.nodes.length, 1);
  assert.deepEqual(knowledgeGraphToRoadmap(graph), legacy);
});

test("compatibility accepts a graph already in unified IR", () => {
  const graph: KnowledgeGraph = { kind: "timeline", title: "History", summary: "", nodes: [], edges: [], groups: [], citations: [], presentation: { layout: "timeline", palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } } };
  assert.equal(viewpointToKnowledgeGraph(graph), graph);
});
