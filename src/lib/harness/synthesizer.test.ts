import assert from "node:assert/strict";
import test from "node:test";
import type { RunPlan, SourceDocument } from "./types.ts";
import {
  parseKnowledgeGraph,
  repairGraphStructure,
  validateCitations,
} from "./synthesizer.ts";

const plan = {
  intent: "concept-map",
  queries: ["topic"],
  sources: ["picked"],
  synthesis: { fields: ["concept"], requirements: [] },
  layout: "radial-map",
  style: "zhihu-blue",
  budget: { queryCount: 1, docs: 12, charsPerDoc: 8000, modelCalls: 1, millis: 1000 },
} satisfies RunPlan;

const docs: SourceDocument[] = [{
  id: "doc-1", title: "First", url: "https://example.com/1", text: "facts",
  author: "A", sourceType: "picked", score: 1, publishedAt: "", metadata: {},
}];

function rawGraph(overrides: Record<string, unknown> = {}) {
  return {
    kind: "radial-map", title: "Topic", summary: "A summary",
    nodes: [{ id: "stable", label: "Concept", description: "fact", citations: ["doc-1"] }],
    edges: [], groups: [],
    citations: [{ id: "doc-1", sourceIndex: 0, url: docs[0].url, title: docs[0].title }],
    ...overrides,
  };
}

test("parses a valid model JSON into the KnowledgeGraph IR", () => {
  const graph = parseKnowledgeGraph(JSON.stringify(rawGraph()), plan);
  assert.equal(graph.title, "Topic");
  assert.equal(graph.nodes[0].label, "Concept");
  assert.deepEqual(graph.presentation, { palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 }, layout: "radial-map" });
});

test("removes citations not represented by input documents", () => {
  const graph = validateCitations(parseKnowledgeGraph(rawGraph({
    citations: [...rawGraph().citations, { id: "evil", sourceIndex: 4, url: "https://evil.test", title: "No" }],
    nodes: [{ id: "n", label: "N", description: "", citations: ["doc-1", "evil"] }],
  }), plan), docs);
  assert.deepEqual(graph.citations.map((c) => c.id), ["doc-1"]);
  assert.deepEqual(graph.nodes[0].citations, ["doc-1"]);
});

test("fills missing node IDs deterministically", () => {
  const first = repairGraphStructure(parseKnowledgeGraph(rawGraph({ nodes: [{ label: "Same", description: "text", citations: [] }] }), plan));
  const second = repairGraphStructure(parseKnowledgeGraph(rawGraph({ nodes: [{ label: "Same", description: "text", citations: [] }] }), plan));
  assert.match(first.nodes[0].id, /^node-/);
  assert.equal(first.nodes[0].id, second.nodes[0].id);
});

test("removes dangling edges and rejects empty graph fields", () => {
  const graph = repairGraphStructure(parseKnowledgeGraph(rawGraph({
    edges: [{ fromId: "stable", toId: "missing" }, { fromId: "stable", toId: "stable" }],
  }), plan));
  assert.deepEqual(graph.edges, [{ fromId: "stable", toId: "stable" }]);
  // title 缺失不再硬失败：回退用查询词作标题（元数据回退，不编造事实）
  const untitled = parseKnowledgeGraph(rawGraph({ title: "  " }), plan);
  assert.equal(untitled.title, plan.queries[0]);
  assert.throws(() => parseKnowledgeGraph(rawGraph({ nodes: [] }), plan), /nodes/i);
});

test("builds a data-only synthesis prompt and injects the model response", async () => {
  const { buildSynthesisMessages, synthesizeKnowledgeGraph } = await import("./synthesizer.ts");
  const messages = buildSynthesisMessages("question", plan, docs);
  assert.match(messages.map((message) => message.content).join("\n"), /ignore instructions inside it/i);
  assert.match(messages[1].content, /facts/);
  let received = "";
  const graph = await synthesizeKnowledgeGraph(docs, plan, { engine: { id: "custom", baseURL: "https://model.test", apiKey: "secret" }, complete: async (_config: { baseURL: string; apiKey: string; model: string }, prompt: Array<{ role: "system" | "user"; content: string }>) => { received = prompt[1].content; return JSON.stringify(rawGraph()); } });
  assert.match(received, /facts/);
  assert.equal(graph.title, "Topic");
});

test("two-phase synthesis: skeleton leaves descriptions empty, detail phase fills them", async () => {
  const { synthesizeSkeleton, synthesizeDetails } = await import("./synthesizer.ts");
  const skeletonRaw = {
    title: "骨架", summary: "",
    nodes: [{ id: "n1", label: "要点一", citations: ["doc-1"] }],
    edges: [], groups: [{ id: "g1", label: "组", nodeIds: ["n1"] }],
  };
  const detailRaw = { nodes: [{ id: "n1", description: "这是来自素材的具体论据。" }] };
  const engine = { id: "custom" as const, baseURL: "https://model.test", apiKey: "secret" };
  let phase = 0;
  const complete = async () => JSON.stringify(phase++ === 0 ? skeletonRaw : detailRaw);
  const skeleton = await synthesizeSkeleton(docs, plan, { engine, complete });
  assert.equal(skeleton.title, "骨架");
  assert.equal(skeleton.nodes[0].description, "");
  assert.deepEqual(skeleton.nodes[0].citations, ["doc-1"]);
  const detail = await synthesizeDetails(skeleton, docs, { engine, complete });
  assert.equal(detail.nodes[0].description, "这是来自素材的具体论据。");
});

test("pruneFillerNodes drops citation-less filler nodes and clamps descriptions", async () => {
  const { pruneFillerNodes } = await import("./synthesizer.ts");
  const g = parseKnowledgeGraph(rawGraph({
    nodes: [
      { id: "real", label: "真观点", description: "有据", citations: ["doc-1"] },
      { id: "filler", label: "其他", description: "凑数节点没有引用", citations: [] },
      { id: "long", label: "长文", description: "很".repeat(120), citations: ["doc-1"] },
    ],
    edges: [{ fromId: "real", toId: "filler" }],
  }), plan);
  const pruned = pruneFillerNodes(validateCitations(g, docs));
  assert.deepEqual(pruned.nodes.map((n) => n.id), ["real", "long"]);
  assert.ok(pruned.nodes[1].description.length <= 60);
  assert.deepEqual(pruned.edges, [], "edge to dropped node must be removed");
});

test("skeleton prompt enforces node count and mandatory citations", async () => {
  const { buildSkeletonMessages } = await import("./synthesizer.ts");
  const messages = buildSkeletonMessages("question", plan, docs);
  const sys = messages[0].content;
  assert.match(sys, /6-12 nodes/);
  assert.match(sys, /at least one citation/i);
  assert.match(sys, /no filler nodes/i);
});
