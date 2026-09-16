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

// 去除超链接：必须走 set_links 开关，而不是删节点/改内容
test("router: 去除超链接 produces set_links off, not node deletion", () => {
  const ctx = buildAgentContext(graph());
  for (const text of ["去除超链接", "把链接去掉", "不要卡片上的跳转链接", "删掉超链接"]) {
    const route = routeByRules(text, ctx);
    assert.equal(route?.intent, "style", `"${text}" should route to style, got ${route?.intent}`);
    const changes = changesFromRules(route!, text, ctx);
    assert.deepEqual(changes, [{ type: "set_links", enabled: false }], `"${text}" should produce set_links off`);
  }
});

test("router: 恢复超链接 produces set_links on", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("恢复卡片链接", ctx);
  const changes = changesFromRules(route!, "恢复卡片链接", ctx);
  assert.deepEqual(changes, [{ type: "set_links", enabled: true }]);
});

test("apply: set_links toggles metadata.linksEnabled without touching nodes/citations", () => {
  const g = graph();
  const off = applyChangesAtomically(g, [{ type: "set_links", enabled: false }]);
  assert.equal(off.ok, true);
  assert.equal(off.graph.metadata?.linksEnabled, false);
  assert.equal(off.graph.nodes.length, g.nodes.length);
  assert.deepEqual(off.graph.nodes.map((n) => n.citations), g.nodes.map((n) => n.citations));
  const on = applyChangesAtomically(off.graph, [{ type: "set_links", enabled: true }]);
  assert.equal(on.graph.metadata?.linksEnabled, true);
});

test("validate: set_links rejects non-boolean enabled", () => {
  const issues = validateChanges(graph(), [{ type: "set_links", enabled: "no" as never }]);
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

// ---------- Phase 27：结构理解修复（增删节点/连线/分组容器）----------

test("router: 加第4点/再加一点 routes to structure with high confidence (no clarify)", () => {
  const ctx = buildAgentContext(graph());
  for (const text of ["学习路线只有三点，再加第四点", "再补充一条", "新增一个阶段", "加一张卡片", "再要一个观点"]) {
    const route = routeByRules(text, ctx);
    assert.equal(route?.intent, "structure", `"${text}" should route to structure, got ${route?.intent}`);
    assert.equal(route?.confidence, "high", `"${text}" must be high confidence so clarify does not swallow it`);
  }
});

test("router: 去掉 A 到 B 的箭头 routes to structure, targets resolved by label", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("去掉支持考研到先就业再考研的箭头", ctx);
  assert.equal(route?.intent, "structure");
  assert.deepEqual([...route!.targetIds].sort(), ["n1", "n3"]);
});

test("router: 大卡包住两点 routes to structure with members resolved", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("用一张大卡包住支持考研和支持就业", ctx);
  assert.equal(route?.intent, "structure");
  assert.deepEqual([...route!.targetIds].sort(), ["n1", "n2"]);
});

test("router: 去掉链接 still routes to style (not swallowed by arrow rules)", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("把链接去掉", ctx);
  assert.equal(route?.intent, "style");
});

test("apply: add_node generates deterministic unique id and joins group", () => {
  const g = graph();
  const result = applyChangesAtomically(g, [
    { type: "add_node", label: "边工作边备考", description: "在职备考时间碎片化", groupId: "g1" },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.graph.nodes.length, 4);
  const added = result.graph.nodes[3];
  assert.equal(added.label, "边工作边备考");
  assert.equal(added.group, "g1");
  assert.ok(result.graph.groups.find((grp) => grp.id === "g1")!.nodeIds.includes(added.id));
  // 再加同名节点 → 序号后缀不冲突
  const again = applyChangesAtomically(result.graph, [
    { type: "add_node", label: "边工作边备考", description: "另一个" },
  ]);
  assert.equal(again.ok, true);
  assert.notEqual(again.graph.nodes[4].id, added.id);
});

test("apply: add_group with empty label registers container without changing node.group", () => {
  const result = applyChangesAtomically(graph(), [
    { type: "add_group", label: "", nodeIds: ["n1", "n2"] },
  ]);
  assert.equal(result.ok, true);
  const containers = result.graph.metadata?.groupContainers as string[];
  assert.equal(containers.length, 1);
  const wrap = result.graph.groups.find((grp) => grp.id === containers[0])!;
  assert.deepEqual(wrap.nodeIds, ["n1", "n2"]);
  // 容器不动版式归属：n1/n2 的 group 字段保持原样
  assert.equal(result.graph.nodes[0].group, "g1");
  assert.equal(result.graph.nodes[1].group, "g2");
});

test("apply: add_group with label moves members out of old groups", () => {
  const result = applyChangesAtomically(graph(), [
    { type: "add_group", label: "折中方案", nodeIds: ["n1", "n3"] },
  ]);
  assert.equal(result.ok, true);
  assert.ok(!result.graph.groups.find((grp) => grp.id === "g1")!.nodeIds.includes("n1"));
  assert.equal(result.graph.nodes.find((n) => n.id === "n1")!.group, result.graph.groups.at(-1)!.id);
});

test("apply: remove_edges drops data edge and records removedEdges; add_edge restores", () => {
  const g = graph();
  const off = applyChangesAtomically(g, [
    { type: "remove_edges", pairs: [{ fromId: "n1", toId: "n3" }], reason: "用户要求" },
  ]);
  assert.equal(off.ok, true);
  assert.equal(off.graph.edges.length, 0);
  assert.deepEqual(off.graph.metadata?.removedEdges, ["n1→n3"]);
  const back = applyChangesAtomically(off.graph, [{ type: "add_edge", fromId: "n1", toId: "n3" }]);
  assert.equal(back.ok, true);
  assert.equal(back.graph.edges.length, 1);
  assert.deepEqual(back.graph.metadata?.removedEdges, []);
  assert.match(back.applied[0], /恢复/);
});

test("apply: remove_edges accepts decorative lane ids", () => {
  const issues = validateChanges(graph(), [
    { type: "remove_edges", pairs: [{ fromId: "lane-0", toId: "lane-1" }], reason: "不要站间箭头" },
  ]);
  assert.equal(issues.length, 0);
  const result = applyChangesAtomically(graph(), [
    { type: "remove_edges", pairs: [{ fromId: "lane-0", toId: "lane-1" }], reason: "不要站间箭头" },
  ]);
  assert.equal(result.ok, true);
  assert.ok((result.graph.metadata?.removedEdges as string[]).includes("lane-arrow-0→lane-1"));
});

test("validate: rejects unknown node/self-loop/empty container", () => {
  assert.equal(validateChanges(graph(), [{ type: "add_edge", fromId: "n1", toId: "ghost" }]).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "add_edge", fromId: "n1", toId: "n1" }]).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "add_group", label: "", nodeIds: [] }]).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "remove_edges", pairs: [{ fromId: "n1", toId: "ghost" }], reason: "x" }]).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "add_node", label: "  ", description: "x" }]).length, 1);
});

test("risk: remove_edges high / add_edge medium / add_node low / add_group low", () => {
  assert.equal(classifyRisk([{ type: "remove_edges", pairs: [{ fromId: "n1", toId: "n2" }], reason: "x" }]), "high");
  assert.equal(classifyRisk([{ type: "add_edge", fromId: "n1", toId: "n2" }]), "medium");
  assert.equal(classifyRisk([{ type: "add_node", label: "x", description: "y" }]), "low");
  assert.equal(classifyRisk([{ type: "add_group", label: "", nodeIds: ["n1"] }]), "low");
});

test("apply: remove_nodes cleans container groups and removedEdges stay consistent", () => {
  const boxed = applyChangesAtomically(graph(), [{ type: "add_group", label: "", nodeIds: ["n1", "n3"] }]);
  assert.equal(boxed.ok, true);
  const removed = applyChangesAtomically(boxed.graph, [{ type: "remove_nodes", nodeIds: ["n3"], reasons: ["重复"] }]);
  assert.equal(removed.ok, true);
  // 容器分组成员同步清理，不留下悬空引用（结构完整性检查兜底）
  const wrapId = (boxed.graph.metadata?.groupContainers as string[])[0];
  assert.deepEqual(removed.graph.groups.find((grp) => grp.id === wrapId)!.nodeIds, ["n1"]);
});

test("apply: add_edge restores decorative lane arrow (clears derived lane-arrow record)", () => {
  const off = applyChangesAtomically(graph(), [
    { type: "remove_edges", pairs: [{ fromId: "lane-0", toId: "lane-1" }], reason: "不要站间箭头" },
  ]);
  assert.equal(off.ok, true);
  const back = applyChangesAtomically(off.graph, [{ type: "add_edge", fromId: "lane-0", toId: "lane-1" }]);
  assert.equal(back.ok, true);
  assert.deepEqual(back.graph.metadata?.removedEdges, []);
  assert.equal(back.graph.edges.length, 1, "decorative restore must not pollute graph.edges");
  assert.match(back.applied[0], /恢复/);
});

test("validate: add_edge accepts decorative ids", () => {
  assert.equal(validateChanges(graph(), [{ type: "add_edge", fromId: "lane-0", toId: "lane-1" }]).length, 0);
  assert.equal(validateChanges(graph(), [{ type: "add_edge", fromId: "question", toId: "debate-consensus" }]).length, 0);
});

// ───── P30 自由微调 ─────

test("validate+apply: set_node_style happy path writes styleOverrides", () => {
  const g = graph();
  const changes = [{ type: "set_node_style", nodeId: "n1", patch: { fill: "#fff4e6", fontScale: 1.2 } }] as never;
  assert.equal(validateChanges(g, changes).length, 0);
  const result = applyChangesAtomically(g, changes);
  assert.equal(result.ok, true);
  const n1 = result.graph.nodes.find((n) => n.id === "n1")!;
  assert.deepEqual(n1.metadata?.styleOverrides, { fill: "#fff4e6", fontScale: 1.2 });
  assert.match(result.applied[0], /底色、字号/);
});

test("validate: set_node_style rejects bad colors/ranges/empty patch/unknown node", () => {
  assert.equal(validateChanges(graph(), [{ type: "set_node_style", nodeId: "n1", patch: { fill: "red" } }] as never).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "set_node_style", nodeId: "n1", patch: { fontScale: 3 } }] as never).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "set_node_style", nodeId: "n1", patch: { width: 50 } }] as never).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "set_node_style", nodeId: "ghost", patch: { fill: "#ffffff" } }] as never).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "set_node_style", nodeId: "n1", patch: {} }] as never).length, 1);
});

test("apply: set_node_style merges into existing overrides", () => {
  const first = applyChangesAtomically(graph(), [{ type: "set_node_style", nodeId: "n1", patch: { fill: "#111111" } }] as never);
  const second = applyChangesAtomically(first.graph, [{ type: "set_node_style", nodeId: "n1", patch: { stroke: "#222222" } }] as never);
  assert.deepEqual(second.graph.nodes.find((n) => n.id === "n1")!.metadata?.styleOverrides, { fill: "#111111", stroke: "#222222" });
});

test("apply: move_element accumulates clamped offsets; reset clears", () => {
  const once = applyChangesAtomically(graph(), [{ type: "move_element", nodeId: "n2", dx: -60, dy: 30 }] as never);
  assert.deepEqual(once.graph.metadata?.elementOffsets, { n2: { dx: -60, dy: 30 } });
  assert.match(once.applied[0], /左移 60px、下移 30px/);
  const twice = applyChangesAtomically(once.graph, [{ type: "move_element", nodeId: "n2", dx: -60, dy: 0 }] as never);
  assert.deepEqual(twice.graph.metadata?.elementOffsets, { n2: { dx: -120, dy: 30 } });
  const reset = applyChangesAtomically(twice.graph, [{ type: "move_element", nodeId: "n2", dx: 0, dy: 0, reset: true }] as never);
  assert.deepEqual(reset.graph.metadata?.elementOffsets, {});
  assert.match(reset.applied[0], /回到默认位置/);
});

test("validate: move_element rejects non-number and over-range", () => {
  assert.equal(validateChanges(graph(), [{ type: "move_element", nodeId: "n1", dx: 1000, dy: 0 }] as never).length, 1);
  assert.equal(validateChanges(graph(), [{ type: "move_element", nodeId: "ghost", dx: 10, dy: 10 }] as never).length, 1);
});

test("apply: set_spacing sets/resets spacingScale", () => {
  const set = applyChangesAtomically(graph(), [{ type: "set_spacing", scale: 1.25 }] as never);
  assert.equal(set.graph.metadata?.spacingScale, 1.25);
  assert.match(set.applied[0], /放宽/);
  const tight = applyChangesAtomically(graph(), [{ type: "set_spacing", scale: 0.8 }] as never);
  assert.match(tight.applied[0], /收紧/);
  const reset = applyChangesAtomically(set.graph, [{ type: "set_spacing", reset: true }] as never);
  assert.equal(reset.graph.metadata?.spacingScale, undefined);
  assert.equal(validateChanges(graph(), [{ type: "set_spacing", scale: 2 }] as never).length, 1);
});

test("apply: relayout all and layout switch clear elementOffsets", () => {
  const moved = applyChangesAtomically(graph(), [{ type: "move_element", nodeId: "n1", dx: 50, dy: 50 }] as never);
  assert.ok(moved.graph.metadata?.elementOffsets);
  const relaid = applyChangesAtomically(moved.graph, [{ type: "relayout", scope: "all" }]);
  assert.deepEqual(relaid.graph.metadata?.elementOffsets, {});
  const moved2 = applyChangesAtomically(graph(), [{ type: "move_element", nodeId: "n1", dx: 50, dy: 50 }] as never);
  const switched = applyChangesAtomically(moved2.graph, [{ type: "set_presentation", patch: { layout: "radial-map" } }]);
  assert.deepEqual(switched.graph.metadata?.elementOffsets, {});
});

test("risk: fine-tuning changes are low risk (no preview needed)", () => {
  assert.equal(classifyRisk([{ type: "set_node_style", nodeId: "n1", patch: { fill: "#ffffff" } }] as never), "low");
  assert.equal(classifyRisk([{ type: "move_element", nodeId: "n1", dx: 10, dy: 10 }] as never), "low");
  assert.equal(classifyRisk([{ type: "set_spacing", scale: 1.2 }] as never), "low");
});

test("router: move/spacing fine-tune intents route to style with deterministic changes", () => {
  const ctx = buildAgentContext(graph());
  const move = routeByRules("把「支持考研」往左挪一点", ctx);
  assert.equal(move?.intent, "style");
  const moveChanges = changesFromRules(move!, "把「支持考研」往左挪一点", ctx);
  assert.deepEqual(moveChanges, [{ type: "move_element", nodeId: "n1", dx: -60, dy: 0 }]);

  const spacing = routeByRules("卡片间距大一点", ctx);
  assert.equal(spacing?.intent, "style");
  const spacingChanges = changesFromRules(spacing!, "卡片间距大一点", ctx);
  assert.deepEqual(spacingChanges, [{ type: "set_spacing", scale: 1.25 }]);

  const tight = routeByRules("间距收紧一些", ctx);
  assert.deepEqual(changesFromRules(tight!, "间距收紧一些", ctx), [{ type: "set_spacing", scale: 0.8 }]);

  const back = routeByRules("卡片间距恢复正常", ctx);
  assert.deepEqual(changesFromRules(back!, "卡片间距恢复正常", ctx), [{ type: "set_spacing", reset: true }]);

  const home = routeByRules("把「支持考研」回到原位", ctx);
  assert.deepEqual(changesFromRules(home!, "把「支持考研」回到原位", ctx), [{ type: "move_element", nodeId: "n1", dx: 0, dy: 0, reset: true }]);
});

test("router: explicit pixel move parses distance", () => {
  const ctx = buildAgentContext(graph());
  const route = routeByRules("「支持考研」往上移 120px", ctx);
  const changes = changesFromRules(route!, "「支持考研」往上移 120px", ctx);
  assert.deepEqual(changes, [{ type: "move_element", nodeId: "n1", dx: 0, dy: -120 }]);
});

// ───── P30 恢复连线修复 ─────

test("P30: restore removed decorative edge via add_edge (question→debate-consensus)", () => {
  const g = graph();
  g.nodes.push({ id: "question", label: "考研还是就业", description: "q", citations: [], emphasis: "high" });
  g.nodes.push({ id: "c1", label: "共识1", description: "", citations: [], group: "consensus" });
  g.groups.push({ id: "consensus", label: "共识", nodeIds: ["c1"] });
  // 先删除
  const r1 = applyChangesAtomically(g, [{ type: "remove_edges", pairs: [{ fromId: "question", toId: "debate-consensus" }], reason: "test" }]);
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.graph.metadata?.removedEdges, ["question→debate-consensus"]);
  // 恢复：add_edge 不应把装饰边加进 graph.edges
  const r2 = applyChangesAtomically(r1.graph, [{ type: "add_edge", fromId: "question", toId: "debate-consensus" }]);
  assert.equal(r2.ok, true);
  assert.equal((r2.graph.metadata?.removedEdges as string[] | undefined)?.length ?? 0, 0, "removedEdges 已清空");
  assert.ok(!r2.graph.edges.some(e => e.toId === "debate-consensus"), "装饰边不进 graph.edges");
});

test("P30: restore removed data edge via add_edge (n1→n2)", () => {
  const g = graph();
  g.edges.push({ fromId: "n1", toId: "n2" });
  // 删除数据边
  const r1 = applyChangesAtomically(g, [{ type: "remove_edges", pairs: [{ fromId: "n1", toId: "n2" }], reason: "test" }]);
  assert.equal(r1.ok, true);
  assert.equal(r1.graph.edges.filter(e => e.fromId === "n1" && e.toId === "n2").length, 0);
  // 恢复：数据边应加回 graph.edges
  const r2 = applyChangesAtomically(r1.graph, [{ type: "add_edge", fromId: "n1", toId: "n2" }]);
  assert.equal(r2.ok, true);
  assert.ok(r2.graph.edges.some(e => e.fromId === "n1" && e.toId === "n2"), "数据边恢复进 graph.edges");
});

test("P30: restore lane arrow via add_edge (lane-0→lane-1)", () => {
  const g = graph();
  // 删除站间箭头
  const r1 = applyChangesAtomically(g, [{ type: "remove_edges", pairs: [{ fromId: "lane-0", toId: "lane-1" }], reason: "test" }]);
  assert.equal(r1.ok, true);
  // 恢复
  const r2 = applyChangesAtomically(r1.graph, [{ type: "add_edge", fromId: "lane-0", toId: "lane-1" }]);
  assert.equal(r2.ok, true);
  assert.equal((r2.graph.metadata?.removedEdges as string[] | undefined)?.length ?? 0, 0, "removedEdges 已清空");
});
