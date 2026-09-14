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

test("viewpoint roundtrip survives JSON serialization without caps or field loss", () => {
  const legacy = {
    question: "Many opinions",
    consensus: Array.from({ length: 11 }, (_, i) => `Consensus ${i}`),
    viewpoints: Array.from({ length: 12 }, (_, i) => ({
      stance: `Stance ${i}`,
      summary: `Summary ${i}`,
      evidence: [`Evidence ${i}`, `Evidence ${i}-b`],
      authors: [`Author ${i}`],
      sources: [`https://example.test/view/${i}`],
    })),
    style: "bold" as const,
  };
  const serialized = JSON.parse(JSON.stringify(viewpointToKnowledgeGraph(legacy))) as KnowledgeGraph;
  // P25：观点按奇偶交错分成 stance-1/stance-2 两个对立组（不再全塞 "viewpoints" 一组）
  assert.equal(serialized.nodes.filter((node) => node.group?.startsWith("stance-")).length, 12);
  assert.equal(serialized.nodes.filter((node) => node.group === "stance-1").length, 6);
  assert.equal(serialized.nodes.filter((node) => node.group === "stance-2").length, 6);
  assert.equal(serialized.nodes.filter((node) => node.group === "consensus").length, 11);
  // roundtrip：反转后 viewpoints 顺序保持 stance-1,stance-2 交错展开 = 原顺序
  assert.deepEqual(knowledgeGraphToViewpoint(serialized), legacy);
});

test("roadmap roundtrip survives JSON serialization without stage or item caps", () => {
  const legacy = {
    kind: "roadmap" as const,
    topic: "Large roadmap",
    stages: Array.from({ length: 10 }, (_, stage) => ({
      title: `Stage ${stage}`,
      items: Array.from({ length: 9 }, (_, item) => ({
        topic: `Topic ${stage}-${item}`,
        detail: `Detail ${stage}-${item}`,
        source: `https://example.test/${stage}/${item}`,
      })),
    })),
  };
  const serialized = JSON.parse(JSON.stringify(roadmapToKnowledgeGraph(legacy))) as KnowledgeGraph;
  assert.equal(serialized.groups.length, 10);
  assert.equal(serialized.nodes.length, 90);
  assert.deepEqual(knowledgeGraphToRoadmap(serialized), legacy);
});

test("compatibility accepts a graph already in unified IR", () => {
  const graph: KnowledgeGraph = { kind: "timeline", title: "History", summary: "", nodes: [], edges: [], groups: [], citations: [], presentation: { layout: "timeline", palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } } };
  assert.equal(viewpointToKnowledgeGraph(graph), graph);
});
