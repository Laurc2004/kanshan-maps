import type { KnowledgeGraph, KnowledgeGroup, KnowledgeNode, PresentationSpec } from "./types.ts";

type Emphasis = "low" | "normal" | "high";
export type KnowledgeGraphOp =
  | { op: "add_node"; node: KnowledgeNode; groupId?: string }
  | { op: "update_node"; nodeId: string; patch: Partial<KnowledgeNode> }
  | { op: "remove_node"; nodeId: string }
  | { op: "add_group"; group: KnowledgeGroup }
  | { op: "update_group"; groupId: string; patch: Partial<KnowledgeGroup> }
  | { op: "remove_group"; groupId: string }
  | { op: "set_node_group"; nodeId: string; groupId?: string }
  | { op: "set_emphasis"; target: "node"; id: string; emphasis: Emphasis }
  | { op: "set_emphasis"; target: "edge"; fromId: string; toId: string; emphasis: Emphasis }
  | { op: "rename_graph"; title?: string; summary?: string }
  | { op: "set_presentation"; patch: Partial<PresentationSpec> }
  | { op: "relayout" }
  | { op: "reset" }
  | { op: "no_op" };

export type KnowledgeGraphPatchResult = { graph: KnowledgeGraph; applied: string[]; failed: string[]; changed: boolean };

const layouts = new Set(["debate-grid", "radial-map", "timeline", "swimlane-roadmap", "cluster-board", "evidence-tree"]);
const palettes = new Set(["zhihu-blue", "paper-pastel", "research-mono", "poster-bold", "nature-notes"]);
const densities = new Set(["compact", "comfortable", "spacious"]);
const strokes = new Set(["clean", "sketch", "marker"]);
const emphases = new Set(["low", "normal", "high"]);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const node = (g: KnowledgeGraph, id: string) => g.nodes.find((item) => item.id === id);
const group = (g: KnowledgeGraph, id: string) => g.groups.find((item) => item.id === id);
const edge = (g: KnowledgeGraph, fromId: string, toId: string) => g.edges.find((item) => item.fromId === fromId && item.toId === toId);
function validCitationIds(g: KnowledgeGraph) { return new Set(g.citations.map((citation) => citation.id)); }
function assertNode(g: KnowledgeGraph, id: string) { if (!node(g, id)) throw new Error(`未知节点: ${id}`); }
function assertCitations(g: KnowledgeGraph, citations: unknown) {
  if (!Array.isArray(citations) || citations.some((id) => typeof id !== "string" || !validCitationIds(g).has(id))) throw new Error("引用了未知来源");
}
function assertNodeShape(value: KnowledgeNode) {
  if (!value || typeof value.id !== "string" || !value.id || typeof value.label !== "string" || !value.label || typeof value.description !== "string" || !Array.isArray(value.citations)) throw new Error("节点字段无效");
}

function applyOne(g: KnowledgeGraph, op: KnowledgeGraphOp) {
  switch (op.op) {
    case "add_node": {
      assertNodeShape(op.node); if (node(g, op.node.id)) throw new Error(`节点已存在: ${op.node.id}`); assertCitations(g, op.node.citations);
      if (op.groupId) { if (typeof op.groupId !== "string" || !op.groupId.trim()) throw new Error("分组 ID 缺失：请使用 graph.groups 中的真实 id，不能是标签名或 undefined"); const target = group(g, op.groupId); if (!target) throw new Error(`未知分组: ${op.groupId}（只能用 graph.groups 里的 id）`); }
      g.nodes.push(clone({ ...op.node, ...(op.groupId ? { group: op.groupId } : {}) }));
      if (op.groupId) group(g, op.groupId)!.nodeIds.push(op.node.id);
      return `新增节点「${op.node.label}」`;
    }
    case "update_node": {
      const target = node(g, op.nodeId); if (!target) throw new Error(`未知节点: ${op.nodeId}`);
      if ("id" in op.patch && op.patch.id !== op.nodeId) throw new Error("不允许修改节点 ID");
      if (op.patch.citations !== undefined) assertCitations(g, op.patch.citations);
      if (op.patch.group !== undefined && op.patch.group !== "") { if (typeof op.patch.group !== "string" || !op.patch.group.trim() || !group(g, op.patch.group)) throw new Error(`未知分组: ${String(op.patch.group)}（只能用 graph.groups 里的 id）`); }
      Object.assign(target, clone(op.patch)); return `更新节点「${target.label}」`;
    }
    case "remove_node": {
      const target = node(g, op.nodeId); if (!target) throw new Error(`未知节点: ${op.nodeId}`);
      g.nodes = g.nodes.filter((item) => item.id !== op.nodeId); g.edges = g.edges.filter((item) => item.fromId !== op.nodeId && item.toId !== op.nodeId); g.groups.forEach((item) => { item.nodeIds = item.nodeIds.filter((id) => id !== op.nodeId); }); return `删除节点「${target.label}」`;
    }
    case "add_group":
      if (!op.group?.id || group(g, op.group.id)) throw new Error("分组 ID 无效或已存在");
      if (op.group.nodeIds.some((id) => !node(g, id))) throw new Error("分组包含未知节点");
      g.groups.push(clone(op.group)); return `新增分组「${op.group.label}」`;
    case "update_group": {
      if (typeof op.groupId !== "string" || !op.groupId.trim()) throw new Error("分组 ID 缺失：请使用 graph.groups 中的真实 id");
      const target = group(g, op.groupId); if (!target) throw new Error(`未知分组: ${op.groupId}（只能用 graph.groups 里的 id）`);
      if (!op.patch || typeof op.patch !== "object") throw new Error("update_group 需要 patch 对象");
      if (op.patch.id !== undefined && op.patch.id !== op.groupId) throw new Error("不允许修改分组 ID");
      if (op.patch.nodeIds && op.patch.nodeIds.some((id) => !node(g, id))) throw new Error("分组包含未知节点");
      Object.assign(target, clone(op.patch)); return `更新分组「${target.label}」`;
    }
    case "remove_group": {
      if (typeof op.groupId !== "string" || !op.groupId.trim()) throw new Error("分组 ID 缺失：请使用 graph.groups 中的真实 id");
      if (!group(g, op.groupId)) throw new Error(`未知分组: ${op.groupId}（只能用 graph.groups 里的 id）`); g.groups = g.groups.filter((item) => item.id !== op.groupId); g.nodes.forEach((item) => { if (item.group === op.groupId) delete item.group; }); return "删除分组";
    }
    case "set_node_group": {
      assertNode(g, op.nodeId); if (op.groupId !== undefined && (typeof op.groupId !== "string" || !op.groupId.trim())) throw new Error("分组 ID 缺失：请使用 graph.groups 中的真实 id"); if (op.groupId && !group(g, op.groupId)) throw new Error(`未知分组: ${op.groupId}（只能用 graph.groups 里的 id）`);
      g.groups.forEach((item) => { item.nodeIds = item.nodeIds.filter((id) => id !== op.nodeId); }); const target = node(g, op.nodeId)!; if (op.groupId) { target.group = op.groupId; group(g, op.groupId)!.nodeIds.push(op.nodeId); } else delete target.group; return "调整节点分组";
    }
    case "set_emphasis":
      if (!emphases.has(op.emphasis)) throw new Error("强调级别无效");
      if (op.target === "node") { assertNode(g, op.id); node(g, op.id)!.emphasis = op.emphasis; return "调整节点强调级别"; }
      assertNode(g, op.fromId); assertNode(g, op.toId); const target = edge(g, op.fromId, op.toId); if (!target) throw new Error("未知连线"); target.emphasis = op.emphasis; return "调整连线强调级别";
    case "rename_graph":
      if (op.title !== undefined) { if (!op.title.trim()) throw new Error("标题不能为空"); g.title = op.title.slice(0, 160); } if (op.summary !== undefined) g.summary = op.summary.slice(0, 500); return "更新图标题与摘要";
    case "set_presentation": {
      const p = op.patch;
      if (!p || typeof p !== "object") throw new Error("set_presentation 需要 patch 对象（如 {\"patch\":{\"palette\":\"monochrome\"}}）");
      if (p.layout !== undefined && !layouts.has(p.layout)) throw new Error("不支持的布局");
      if (p.palette !== undefined && !palettes.has(p.palette)) throw new Error("不支持的调色板");
      if (p.density !== undefined && !densities.has(p.density)) throw new Error("不支持的密度");
      if (p.stroke !== undefined && !strokes.has(p.stroke)) throw new Error("不支持的线条");
      if (p.hierarchy && Object.values(p.hierarchy).some((v) => typeof v !== "number" || v <= 0 || v > 3)) throw new Error("层级参数无效");
      g.presentation = { ...g.presentation, ...clone(p), hierarchy: { ...g.presentation.hierarchy, ...(p.hierarchy ?? {}) } }; if (p.layout) g.kind = p.layout; return "更新呈现参数";
    }
    case "relayout": return "重新布局";
    case "reset": return "恢复修改前的图";
    case "no_op": return "";
    default: throw new Error("未知操作");
  }
}

export function applyKnowledgeGraphOps(graph: KnowledgeGraph, ops: KnowledgeGraphOp[], originalGraph: KnowledgeGraph = graph): KnowledgeGraphPatchResult {
  let current = clone(graph); const applied: string[] = []; const failed: string[] = [];
  for (const [index, op] of ops.entries()) {
    if (op.op === "reset") { current = clone(originalGraph); applied.push(`操作${index + 1}：恢复修改前的图`); continue; }
    const candidate = clone(current);
    try { const description = applyOne(candidate, op); if (description) { current = candidate; applied.push(`操作${index + 1}：${description}`); } } catch (error) { failed.push(`操作${index + 1}：${error instanceof Error ? error.message : "操作失败"}`); }
  }
  return { graph: current, applied, failed, changed: JSON.stringify(current) !== JSON.stringify(graph) };
}

export const KNOWLEDGE_GRAPH_AGENT_INSTRUCTION = `你是知识图助手，只输出 JSON：{"reply":"...","ops":[...]}。你只能使用受限操作：add_node、update_node、remove_node、add_group、update_group、remove_group、set_node_group、set_emphasis、rename_graph、set_presentation、relayout、reset、no_op。
关键规则：
- 所有 nodeId/groupId/fromId/toId 必须取自下方"可用 ID"列表，禁止使用标签名、undefined 或自造 ID。
- set_presentation 必须带 patch 对象，如 {"op":"set_presentation","patch":{"palette":"monochrome"}}。
- 不能新增或修改 citations，不能编造来源；不要输出坐标或 Excalidraw 元素。`;
export function buildKnowledgeGraphAgentMessages(history: { role: string; content: string }[], graph: KnowledgeGraph, message: string) {
  const transcript = history.slice(-8).map((item) => `${item.role === "user" ? "用户" : "助手"}: ${item.content}`).join("\n");
  const nodeIds = graph.nodes.map((n) => `${n.id}（${n.label.slice(0, 12)}）`).join("、");
  const groupIds = graph.groups.map((grp) => `${grp.id}（${grp.label.slice(0, 12)}）`).join("、") || "（无分组）";
  return [{ role: "user", content: `${KNOWLEDGE_GRAPH_AGENT_INSTRUCTION}\n可用 ID —— 节点：${nodeIds}\n可用 ID —— 分组：${groupIds}\n当前 graph：\n${JSON.stringify(graph)}\n${transcript ? `对话历史：\n${transcript}\n` : ""}用户要求：${message}` }];
}
export function parseKnowledgeGraphAgentResponse(raw: string): { reply: string; ops: KnowledgeGraphOp[] } {
  const text = raw.replace(/```json|```/g, "").trim(); const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return { reply: raw.slice(0, 200), ops: [] };
  try { const parsed = JSON.parse(text.slice(start, end + 1)); return { reply: typeof parsed.reply === "string" ? parsed.reply : "已更新", ops: Array.isArray(parsed.ops) ? parsed.ops as KnowledgeGraphOp[] : [] }; } catch { return { reply: "这次没听懂，换个说法试试？", ops: [] }; }
}
