// 原子执行与风险分级：任何一步失败整组不提交
import type { KnowledgeGraph, PresentationSpec } from "../harness/types.ts";
import type { GraphChange, Risk } from "./types.ts";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const LAYOUTS = new Set(["debate-grid", "radial-map", "timeline", "swimlane-roadmap", "cluster-board", "evidence-tree"]);
const PALETTES = new Set(["zhihu-blue", "paper-pastel", "research-mono", "poster-bold", "nature-notes"]);
const DENSITIES = new Set(["compact", "comfortable", "spacious"]);
const STROKES = new Set(["clean", "sketch", "marker"]);

export interface ValidationIssue {
  changeIndex: number;
  message: string;
}

export interface ApplyResult {
  ok: boolean;
  graph: KnowledgeGraph; // ok=false 时返回原图（未修改）
  applied: string[];
  issues: ValidationIssue[];
}

function findNode(g: KnowledgeGraph, id: string) {
  return g.nodes.find((n) => n.id === id);
}
function findGroup(g: KnowledgeGraph, id: string) {
  return g.groups.find((grp) => grp.id === id);
}

export function classifyRisk(changes: GraphChange[]): Risk {
  let risk: Risk = "low";
  for (const c of changes) {
    if (c.type === "remove_nodes" || c.type === "merge_nodes") return "high";
    if (
      c.type === "move_node" ||
      (c.type === "relayout" && c.scope === "all") ||
      (c.type === "rewrite_consensus" && c.items.length > 2)
    ) {
      risk = "medium";
    }
  }
  return risk;
}

export function validateChanges(graph: KnowledgeGraph, changes: GraphChange[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const groupIds = new Set(graph.groups.map((g) => g.id));

  changes.forEach((c, i) => {
    const need = (cond: boolean, msg: string) => { if (!cond) issues.push({ changeIndex: i, message: msg }); };
    switch (c.type) {
      case "rename_graph":
        need(typeof c.title === "string" && c.title.trim().length > 0, "标题不能为空");
        break;
      case "rename_node":
        need(nodeIds.has(c.nodeId), `未知节点: ${c.nodeId}`);
        need(typeof c.label === "string" && c.label.trim().length > 0, "节点标签不能为空");
        break;
      case "rewrite_node_description":
        need(nodeIds.has(c.nodeId), `未知节点: ${c.nodeId}`);
        need(typeof c.description === "string" && c.description.trim().length > 0, "描述不能为空");
        break;
      case "emphasize_node":
        need(nodeIds.has(c.nodeId), `未知节点: ${c.nodeId}`);
        need(["low", "normal", "high"].includes(c.level), "强调级别无效");
        break;
      case "move_node":
        need(nodeIds.has(c.nodeId), `未知节点: ${c.nodeId}`);
        need(c.groupId === null || groupIds.has(c.groupId), `未知分组: ${String(c.groupId)}`);
        break;
      case "remove_nodes":
        need(Array.isArray(c.nodeIds) && c.nodeIds.length > 0, "删除列表不能为空");
        c.nodeIds?.forEach((id) => need(nodeIds.has(id), `未知节点: ${id}`));
        break;
      case "merge_nodes":
        need(Array.isArray(c.nodeIds) && c.nodeIds.length >= 2, "合并至少需要 2 个节点");
        c.nodeIds?.forEach((id) => need(nodeIds.has(id), `未知节点: ${id}`));
        need(typeof c.targetLabel === "string" && c.targetLabel.trim().length > 0, "合并后的标签不能为空");
        break;
      case "rewrite_consensus":
        need(Array.isArray(c.items), "共识必须是数组");
        break;
      case "set_presentation": {
        const p = c.patch;
        need(!!p && typeof p === "object", "set_presentation 需要 patch 对象");
        if (p?.layout !== undefined) need(LAYOUTS.has(p.layout), "不支持的布局");
        if (p?.palette !== undefined) need(PALETTES.has(p.palette), "不支持的调色板");
        if (p?.density !== undefined) need(DENSITIES.has(p.density), "不支持的密度");
        if (p?.stroke !== undefined) need(STROKES.has(p.stroke), "不支持的线条");
        break;
      }
      case "set_mode":
        need(c.mode === "summary" || c.mode === null, "set_mode 只支持 summary 或 null");
        break;
      case "set_links":
        need(typeof c.enabled === "boolean", "set_links 需要 enabled 布尔值");
        break;
      case "relayout":
        need(c.scope === "local" || c.scope === "all", "relayout scope 无效");
        break;
      default:
        issues.push({ changeIndex: i, message: "未知变更类型" });
    }
  });
  return issues;
}

function applyOne(g: KnowledgeGraph, c: GraphChange): string {
  switch (c.type) {
    case "rename_graph": {
      g.title = c.title.trim().slice(0, 160);
      return `标题改为「${g.title}」`;
    }
    case "rename_node": {
      const n = findNode(g, c.nodeId)!;
      n.label = c.label.trim().slice(0, 40);
      return `节点改名为「${n.label}」`;
    }
    case "rewrite_node_description": {
      const n = findNode(g, c.nodeId)!;
      n.description = c.description.trim().slice(0, 200);
      return `精简了「${n.label}」的描述`;
    }
    case "emphasize_node": {
      const n = findNode(g, c.nodeId)!;
      n.emphasis = c.level;
      return c.level === "high" ? `「${n.label}」已标为重点` : `调整了「${n.label}」的强调级别`;
    }
    case "move_node": {
      const n = findNode(g, c.nodeId)!;
      g.groups.forEach((grp) => { grp.nodeIds = grp.nodeIds.filter((id) => id !== c.nodeId); });
      if (c.groupId) {
        n.group = c.groupId;
        findGroup(g, c.groupId)!.nodeIds.push(c.nodeId);
        return `「${n.label}」已移动到「${findGroup(g, c.groupId)!.label}」`;
      }
      delete n.group;
      return `「${n.label}」已移出分组`;
    }
    case "remove_nodes": {
      const removed = new Set(c.nodeIds);
      const labels = g.nodes.filter((n) => removed.has(n.id)).map((n) => n.label);
      g.nodes = g.nodes.filter((n) => !removed.has(n.id));
      g.edges = g.edges.filter((e) => !removed.has(e.fromId) && !removed.has(e.toId));
      g.groups.forEach((grp) => { grp.nodeIds = grp.nodeIds.filter((id) => !removed.has(id)); });
      return `删除了 ${labels.length} 个节点：${labels.join("、")}`;
    }
    case "merge_nodes": {
      const merged = new Set(c.nodeIds);
      const sources = g.nodes.filter((n) => merged.has(n.id));
      const citations = [...new Set(sources.flatMap((n) => n.citations))];
      const keepId = c.nodeIds[0];
      const target = findNode(g, keepId)!;
      target.label = c.targetLabel.trim().slice(0, 40);
      target.description = c.description.trim().slice(0, 200);
      target.citations = citations;
      const removed = c.nodeIds.slice(1);
      g.nodes = g.nodes.filter((n) => !removed.includes(n.id));
      g.edges = g.edges.filter((e) => !removed.includes(e.fromId) && !removed.includes(e.toId));
      g.groups.forEach((grp) => {
        grp.nodeIds = grp.nodeIds.filter((id) => !removed.includes(id));
        if (!grp.nodeIds.includes(keepId) && sources.some((s) => grp.nodeIds.includes(s.id) || s.group === grp.id)) {
          grp.nodeIds.push(keepId);
        }
      });
      return `合并了 ${sources.length} 个节点为「${target.label}」`;
    }
    case "rewrite_consensus": {
      // 共识在 KnowledgeGraph 里体现为一个特殊分组；若无则创建
      const consensusGroup = g.groups.find((grp) => grp.id === "consensus" || /共识/.test(grp.label));
      const items = c.items.map((s) => String(s).slice(0, 80)).filter(Boolean).slice(0, 6);
      if (consensusGroup) {
        consensusGroup.label = items[0] ? `共识：${items[0].slice(0, 20)}` : consensusGroup.label;
      }
      g.summary = items.join("；") || g.summary;
      return `重写共识（${items.length} 条）`;
    }
    case "set_presentation": {
      g.presentation = {
        ...g.presentation,
        ...clone(c.patch),
        hierarchy: { ...g.presentation.hierarchy, ...(c.patch.hierarchy ?? {}) },
      } as PresentationSpec;
      if (c.patch.layout) g.kind = c.patch.layout;
      return c.patch.layout ? "已切换版式" : "已更新视觉风格";
    }
    case "set_mode": {
      if (c.mode === "summary") {
        g.metadata = { ...g.metadata, mode: "summary" };
        return "已切换为思维导图（中心主题 + 左右分支）";
      }
      if (g.metadata) delete g.metadata.mode;
      return "已还原为证据树版式";
    }
    case "set_links": {
      // 超链接开关：记录在 metadata.linksEnabled（渲染层读它决定卡片是否带 link）
      // 不动 citations——来源数据保留，底部来源索引照常展示
      g.metadata = { ...g.metadata, linksEnabled: c.enabled };
      return c.enabled ? "已恢复卡片上的原文链接" : "已去除卡片上的原文链接（底部来源索引仍保留）";
    }
    case "relayout":
      return c.scope === "all" ? "已重新布局整图" : "已局部重排";
    default:
      throw new Error("未知变更类型");
  }
}

// 原子应用：先全量校验，再 clone 上依次执行，最后做结构完整性检查；任何失败返回原图
export function applyChangesAtomically(graph: KnowledgeGraph, changes: GraphChange[]): ApplyResult {
  const issues = validateChanges(graph, changes);
  if (issues.length > 0) {
    return { ok: false, graph, applied: [], issues };
  }
  const next = clone(graph);
  const applied: string[] = [];
  try {
    changes.forEach((c, i) => {
      applied.push(`操作${i + 1}：${applyOne(next, c)}`);
    });
    // 结构完整性：边两端节点必须存在；分组 nodeIds 必须存在
    const nodeIds = new Set(next.nodes.map((n) => n.id));
    const badEdge = next.edges.some((e) => !nodeIds.has(e.fromId) || !nodeIds.has(e.toId));
    const badGroup = next.groups.some((grp) => grp.nodeIds.some((id) => !nodeIds.has(id)));
    if (badEdge || badGroup) {
      return { ok: false, graph, applied: [], issues: [{ changeIndex: -1, message: "变更后图结构不完整，已放弃提交" }] };
    }
    return { ok: true, graph: next, applied, issues: [] };
  } catch (e) {
    return {
      ok: false,
      graph,
      applied: [],
      issues: [{ changeIndex: applied.length, message: e instanceof Error ? e.message : "执行失败" }],
    };
  }
}
