import test from "node:test";
import assert from "node:assert/strict";
import type { KnowledgeGraph } from "./types.ts";
import {
  applyKnowledgeGraphOps,
  buildKnowledgeGraphAgentMessages,
  parseKnowledgeGraphAgentResponse,
  type KnowledgeGraphOp,
} from "./patch.ts";
import { applyOps, type GraphOp } from "../graph-patch.ts";
import type { ViewpointGraph } from "../viewpoints.ts";

function graph(): KnowledgeGraph {
  return {
    kind: "radial-map",
    title: "Original title",
    summary: "Original summary",
    nodes: [
      { id: "root", label: "Root", description: "Root description", citations: ["source-1"], emphasis: "high" },
      { id: "child", label: "Child", description: "Child description", group: "group-1", citations: ["source-1"] },
    ],
    edges: [{ fromId: "root", toId: "child", label: "supports" }],
    groups: [{ id: "group-1", label: "Group", nodeIds: ["child"] }],
    citations: [{ id: "source-1", sourceIndex: 0, url: "https://example.com/1", title: "Source 1" }],
    presentation: {
      layout: "radial-map",
      palette: "zhihu-blue",
      density: "comfortable",
      stroke: "clean",
      hierarchy: { title: 1, keyFinding: 1, evidence: 1 },
    },
  };
}

test("adds, updates, and removes nodes while keeping references valid", () => {
  const ops: KnowledgeGraphOp[] = [
    { op: "add_node", node: { id: "new", label: "New", description: "New description", citations: ["source-1"] }, groupId: "group-1" },
    { op: "update_node", nodeId: "new", patch: { label: "Updated", citations: ["source-1"] } },
    { op: "remove_node", nodeId: "child" },
  ];
  const result = applyKnowledgeGraphOps(graph(), ops);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.graph.nodes.map((node) => node.id), ["root", "new"]);
  assert.equal(result.graph.nodes[1].label, "Updated");
  assert.deepEqual(result.graph.groups[0].nodeIds, ["new"]);
  assert.deepEqual(result.graph.edges, []);
});

test("updates group assignment and emphasis", () => {
  const result = applyKnowledgeGraphOps(graph(), [
    { op: "add_group", group: { id: "group-2", label: "Second", nodeIds: [] } },
    { op: "set_node_group", nodeId: "child", groupId: "group-2" },
    { op: "set_emphasis", target: "node", id: "child", emphasis: "high" },
    { op: "set_emphasis", target: "edge", fromId: "root", toId: "child", emphasis: "low" },
    { op: "update_group", groupId: "group-2", patch: { label: "Renamed" } },
  ]);
  assert.deepEqual(result.failed, []);
  assert.equal(result.graph.nodes[1].group, "group-2");
  assert.equal(result.graph.nodes[1].emphasis, "high");
  assert.equal(result.graph.edges[0].emphasis, "low");
  assert.deepEqual(result.graph.groups, [
    { id: "group-1", label: "Group", nodeIds: [] },
    { id: "group-2", label: "Renamed", nodeIds: ["child"] },
  ]);
});

test("renames graph text and changes every presentation control", () => {
  const result = applyKnowledgeGraphOps(graph(), [
    { op: "rename_graph", title: "New title", summary: "New summary" },
    { op: "set_presentation", patch: { layout: "evidence-tree", palette: "nature-notes", density: "compact", stroke: "marker", hierarchy: { title: 1.3, keyFinding: 1.1, evidence: 0.9 } } },
    { op: "relayout" },
  ]);
  assert.deepEqual(result.failed, []);
  assert.equal(result.graph.title, "New title");
  assert.equal(result.graph.summary, "New summary");
  assert.equal(result.graph.kind, "evidence-tree");
  assert.deepEqual(result.graph.presentation, {
    layout: "evidence-tree", palette: "nature-notes", density: "compact", stroke: "marker",
    hierarchy: { title: 1.3, keyFinding: 1.1, evidence: 0.9 },
  });
  assert.equal(result.changed, true);
});

test("rejects unknown node, group, and citation references without partial corruption", () => {
  const original = graph();
  const result = applyKnowledgeGraphOps(original, [
    { op: "update_node", nodeId: "missing", patch: { label: "Bad" } },
    { op: "set_node_group", nodeId: "child", groupId: "missing" },
    { op: "add_node", node: { id: "bad", label: "Bad", description: "Bad", citations: ["unknown-source"] } },
  ]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 3);
  assert.deepEqual(result.graph, original);
});

test("preserves the citation whitelist and rejects attempts to alter citation records", () => {
  const original = graph();
  const malicious = { op: "add_citation", citation: { id: "fake", url: "https://fake.invalid" } } as unknown as KnowledgeGraphOp;
  const result = applyKnowledgeGraphOps(original, [malicious]);
  assert.deepEqual(result.graph.citations, original.citations);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
});

test("reset restores the pre-message graph after earlier operations", () => {
  const original = graph();
  const current = graph();
  current.title = "Current";
  const result = applyKnowledgeGraphOps(current, [
    { op: "rename_graph", title: "Temporary" },
    { op: "reset" },
  ], original);
  assert.deepEqual(result.graph, original);
  assert.equal(result.changed, true);
});

test("no-op and invalid presentation values do not report a changed graph", () => {
  const invalid = { op: "set_presentation", patch: { layout: "freehand" } } as unknown as KnowledgeGraphOp;
  const result = applyKnowledgeGraphOps(graph(), [{ op: "no_op" }, invalid]);
  assert.equal(result.changed, false);
  assert.equal(result.failed.length, 1);
});

test("agent response parsing only returns constrained operation candidates", () => {
  const parsed = parseKnowledgeGraphAgentResponse("```json\n{\"reply\":\"done\",\"ops\":[{\"op\":\"rename_graph\",\"title\":\"New\"}]}\n```");
  assert.equal(parsed.reply, "done");
  assert.deepEqual(parsed.ops, [{ op: "rename_graph", title: "New" }]);
  const messages = buildKnowledgeGraphAgentMessages([], graph(), "change it");
  assert.match(messages[0].content, /add_node/);
  assert.match(messages[0].content, /不能新增或修改 citations/);
});

test("legacy viewpoint patches remain compatible", () => {
  const legacy: ViewpointGraph = {
    question: "Old",
    consensus: [],
    viewpoints: [{ stance: "A", summary: "B", evidence: [], authors: [], sources: [] }],
  };
  const result = applyOps(legacy, [{ op: "rename_question", question: "New" } satisfies GraphOp], legacy);
  assert.equal(result.graph.question, "New");
  assert.equal(result.applied.length, 1);
});
