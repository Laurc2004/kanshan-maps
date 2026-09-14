import test from "node:test";
import assert from "node:assert/strict";
import type { KnowledgeGraph } from "../harness/types.ts";
import { buildAgentContext, graphHash } from "./types.ts";
import { routeByRules, changesFromRules, parseClassifierResult } from "./router.ts";
import { applyChangesAtomically, classifyRisk, validateChanges } from "./apply.ts";
import { parseDecision } from "./decide.ts";

function graph(): KnowledgeGraph {
  return {
    kind: "debate-grid",
    title: "考研还是就业",
    summary: "两种路径各有支持者",
    nodes: [
      { id: "n1", label: "支持考研", description: "学历溢价仍在", group: "g1", citations: ["c1"] },
      { id: "n2", label: "支持就业", description: "实践经验更值钱", group: "g2", citations: ["c2"] },
      { id: "n3", label: "先就业再考研", description: "折中路线", citations: ["c1"] },
    ],
    edges: [{ fromId: "n1", toId: "n3" }],
    groups: [
      { id: "g1", label: "考研派", nodeIds: ["n1"] },
      { id: "g2", label: "就业派", nodeIds: ["n2"] },
    ],
    citations: [
      { id: "c1", sourceIndex: 0, url: "https://zhihu.com/a/1", title: "回答一" },
      { id: "c2", sourceIndex: 1, url: "https://zhihu.com/a/2", title: "回答二" },
    ],
    presentation: { palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } },
  };
}

test("router: emphasize with ordinal target resolves node id", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("把第一个立场标为重点", ctx);
  assert.equal(route?.intent, "emphasize");
  assert.deepEqual(route?.targetIds, ["n1"]);
  const changes = changesFromRules(route!, "把第一个立场标为重点", ctx);
  assert.deepEqual(changes, [{ type: "emphasize_node", nodeId: "n1", level: "high" }]);
});

test("router: answer intent does not produce changes", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("这张图的核心分歧是什么", ctx);
  assert.equal(route?.intent, "answer");
});

test("router: rename title extracts new title", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("标题改成 考研与就业的长期收益对比", ctx);
  assert.equal(route?.intent, "rename");
  const changes = changesFromRules(route!, "标题改成 考研与就业的长期收益对比", ctx);
  assert.deepEqual(changes, [{ type: "rename_graph", title: "考研与就业的长期收益对比" }]);
});

test("router: delete request routes to structure (preview path)", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("删掉最弱的那个立场", ctx);
  assert.equal(route?.intent, "structure");
});

test("router: relayout request", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("帮我重新排版", ctx);
  assert.equal(route?.intent, "structure");
  const changes = changesFromRules(route!, "帮我重新排版", ctx);
  assert.deepEqual(changes, [{ type: "relayout", scope: "all" }]);
});

test("classifier parse tolerates fenced JSON", () => {
  const r = parseClassifierResult("```json\n{\"intent\":\"answer\",\"targetIds\":[],\"reason\":\"解释类\"}\n```");
  assert.equal(r?.intent, "answer");
});

test("apply: atomic rename + emphasize", () => {
  const result = applyChangesAtomically(graph(), [
    { type: "rename_graph", title: "新标题" },
    { type: "emphasize_node", nodeId: "n2", level: "high" },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.graph.title, "新标题");
  assert.equal(result.graph.nodes[1].emphasis, "high");
  assert.equal(result.applied.length, 2);
});

test("apply: unknown node id aborts whole batch (atomicity)", () => {
  const original = graph();
  const result = applyChangesAtomically(original, [
    { type: "rename_graph", title: "不应提交" },
    { type: "emphasize_node", nodeId: "missing", level: "high" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.graph.title, original.title); // 原图未被修改
  assert.equal(result.applied.length, 0);
});

test("apply: remove_nodes cleans edges and group refs", () => {
  const result = applyChangesAtomically(graph(), [
    { type: "remove_nodes", nodeIds: ["n3"], reasons: ["内容重复"] },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.graph.nodes.length, 2);
  assert.equal(result.graph.edges.length, 0); // n1->n3 边被清理
});

test("apply: merge_nodes combines citations and drops extras", () => {
  const result = applyChangesAtomically(graph(), [
    { type: "merge_nodes", nodeIds: ["n1", "n3"], targetLabel: "考研路径", description: "合并后的描述" },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.graph.nodes.length, 2);
  assert.equal(result.graph.nodes[0].label, "考研路径");
  assert.deepEqual(result.graph.nodes[0].citations, ["c1"]);
});

test("risk: remove/merge are high, presentation is low, move is medium", () => {
  assert.equal(classifyRisk([{ type: "remove_nodes", nodeIds: ["n1"], reasons: [] }]), "high");
  assert.equal(classifyRisk([{ type: "merge_nodes", nodeIds: ["n1", "n2"], targetLabel: "x", description: "y" }]), "high");
  assert.equal(classifyRisk([{ type: "set_presentation", patch: { palette: "research-mono" } }]), "low");
  assert.equal(classifyRisk([{ type: "move_node", nodeId: "n1", groupId: "g2" }]), "medium");
});

test("validate: set_presentation rejects bad palette", () => {
  const issues = validateChanges(graph(), [
    { type: "set_presentation", patch: { palette: "neon" as never } },
  ]);
  assert.equal(issues.length, 1);
});

// 思维导图/证据树切换：只改 presentation.layout 撞上摘要图 summary 分支，必须 set_mode
test("router: 换成思维导图 on evidence-tree flips metadata.mode via set_mode", () => {
  const summaryBoard: KnowledgeGraph = { ...graph(), kind: "evidence-tree", presentation: { ...graph().presentation, layout: "evidence-tree" } };
  const ctx = buildAgentContext(summaryBoard);
  const route = routeByRules("换成思维导图", ctx);
  assert.equal(route?.intent, "style");
  const changes = changesFromRules(route!, "换成思维导图", ctx);
  assert.deepEqual(changes, [
    { type: "set_presentation", patch: { layout: "evidence-tree" } },
    { type: "set_mode", mode: "summary" },
  ]);
  const result = applyChangesAtomically(summaryBoard, changes!);
  assert.equal(result.ok, true);
  assert.equal(result.graph.metadata?.mode, "summary");
  assert.equal(result.graph.presentation.layout, "evidence-tree");
});

test("router: 已经是思维导图时再说换成思维导图只补 set_mode，不动 layout", () => {
  const summaryBoard: KnowledgeGraph = { ...graph(), kind: "evidence-tree", presentation: { ...graph().presentation, layout: "evidence-tree" }, metadata: { mode: "summary" } };
  const ctx = buildAgentContext(summaryBoard);
  const changes = changesFromRules(routeByRules("换成思维导图", ctx)!, "换成思维导图", ctx);
  assert.deepEqual(changes, [{ type: "set_mode", mode: "summary" }]);
});

test("router: 换回证据树 on summary mindmap clears metadata.mode", () => {
  const summaryBoard: KnowledgeGraph = { ...graph(), kind: "evidence-tree", presentation: { ...graph().presentation, layout: "evidence-tree" }, metadata: { mode: "summary" } };
  const ctx = buildAgentContext(summaryBoard);
  const changes = changesFromRules(routeByRules("换回证据树", ctx)!, "换回证据树", ctx);
  assert.deepEqual(changes, [
    { type: "set_presentation", patch: { layout: "evidence-tree" } },
    { type: "set_mode", mode: null },
  ]);
  const result = applyChangesAtomically(summaryBoard, changes!);
  assert.equal(result.ok, true);
  assert.equal(result.graph.metadata?.mode, undefined);
});

test("validate: set_mode rejects invalid mode value", () => {
  const issues = validateChanges(graph(), [{ type: "set_mode", mode: "mindmap" as never }]);
  assert.equal(issues.length, 1);
});

test("decision parse: empty changes → answer", () => {
  const d = parseDecision('{"reply":"核心分歧是学历与经验的权衡","changes":[]}', () => "low");
  assert.equal(d?.type, "answer");
});

test("decision parse: high-risk changes → preview with confirmation", () => {
  const d = parseDecision(
    '{"reply":"建议删除","changes":[{"type":"remove_nodes","nodeIds":["n3"],"reasons":["内容重复"]}]}',
    () => "high",
  );
  assert.equal(d?.type, "preview");
  assert.match((d as { confirmation: string }).confirmation, /删除/);
});

test("decision parse: needClarify → clarify", () => {
  const d = parseDecision('{"reply":"不确定","changes":[],"needClarify":["哪个？"]}', () => "low");
  assert.equal(d?.type, "clarify");
});

test("graphHash changes when graph content changes", () => {
  const g1 = graph();
  const g2 = graph();
  g2.title = "changed";
  assert.notEqual(graphHash(g1), graphHash(g2));
  assert.equal(graphHash(g1), graphHash(graph()));
});
