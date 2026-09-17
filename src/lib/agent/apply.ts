// 原子执行与风险分级：任何一步失败整组不提交
import type { KnowledgeGraph, PresentationSpec } from "../harness/types.ts";
import type { GraphChange, NodeStylePatch, Risk } from "./types.ts";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const LAYOUTS = new Set(["debate-grid", "radial-map", "timeline", "swimlane-roadmap", "cluster-board", "evidence-tree"]);
const PALETTES = new Set(["zhihu-blue", "paper-pastel", "research-mono", "poster-bold", "nature-notes"]);
const DENSITIES = new Set(["compact", "comfortable", "spacious"]);
const STROKES = new Set(["clean", "sketch", "marker"]);

// 固定装饰连线的元素 ID（layouts.ts 里不来自 graph.edges 的箭头）：
// remove_edges 的 pairs 允许用这些 ID 指代「胶囊→共识」「第N站→第N+1站」这类装饰箭头
export const DECORATIVE_EDGE_IDS = new Set(["question", "debate-consensus", "evidence-root"]);
const LANE_ARROW_RE = /^lane-\d+$/;

function edgeKey(a: string, b: string): string {
  return `${a}→${b}`;
}

// metadata.removedEdges 读写：被去掉的连线集合（对数据型边和装饰箭头统一生效，可逆）
function removedEdgeSet(g: KnowledgeGraph): Set<string> {
  const raw = g.metadata?.removedEdges;
  return new Set(Array.isArray(raw) ? (raw as unknown[]).filter((x): x is string => typeof x === "string") : []);
}

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
    if (c.type === "remove_nodes" || c.type === "merge_nodes" || c.type === "remove_edges") return "high";
    if (
      c.type === "move_node" ||
      c.type === "add_edge" ||
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
      case "add_node":
        need(typeof c.label === "string" && c.label.trim().length > 0, "新节点的标题不能为空");
        need(typeof c.description === "string", "新节点需要 description 字段（可为空字符串）");
        if (c.groupId !== undefined && c.groupId !== null) need(groupIds.has(c.groupId), `未知分组: ${String(c.groupId)}`);
        break;
      case "add_group":
        need(typeof c.label === "string", "add_group 需要 label（空字符串表示大卡片容器）");
        need(Array.isArray(c.nodeIds) && c.nodeIds.length >= 1, "大卡片至少要包住 1 张卡片");
        c.nodeIds?.forEach((id) => need(nodeIds.has(id), `未知节点: ${id}`));
        need(new Set(c.nodeIds).size === c.nodeIds?.length, "容器内节点不能重复");
        break;
      case "add_edge":
        // 允许装饰连线 ID（恢复泳道站间箭头/胶囊→共识）：lane-N、question、debate-consensus、evidence-root
        need(nodeIds.has(c.fromId) || DECORATIVE_EDGE_IDS.has(c.fromId) || LANE_ARROW_RE.test(c.fromId), `未知节点: ${c.fromId}`);
        need(nodeIds.has(c.toId) || DECORATIVE_EDGE_IDS.has(c.toId) || LANE_ARROW_RE.test(c.toId), `未知节点: ${c.toId}`);
        need(c.fromId !== c.toId, "连线两端不能是同一张卡片");
        break;
      case "remove_edges":
        need(Array.isArray(c.pairs) && c.pairs.length > 0, "remove_edges 需要 pairs 列表");
        c.pairs?.forEach((p) => {
          need(nodeIds.has(p?.fromId) || DECORATIVE_EDGE_IDS.has(p?.fromId) || LANE_ARROW_RE.test(String(p?.fromId)), `未知连线起点: ${String(p?.fromId)}`);
          need(nodeIds.has(p?.toId) || DECORATIVE_EDGE_IDS.has(p?.toId) || LANE_ARROW_RE.test(String(p?.toId)), `未知连线终点: ${String(p?.toId)}`);
        });
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
      case "set_node_style": {
        need(nodeIds.has(c.nodeId), `未知节点: ${c.nodeId}`);
        const p = c.patch;
        need(!!p && typeof p === "object", "set_node_style 需要 patch 对象");
        if (p?.fill !== undefined) need(/^#[0-9a-fA-F]{3,8}$/.test(String(p.fill)), "fill 必须是 #RRGGBB 颜色");
        if (p?.stroke !== undefined) need(/^#[0-9a-fA-F]{3,8}$/.test(String(p.stroke)), "stroke 必须是 #RRGGBB 颜色");
        if (p?.fontScale !== undefined) need(typeof p.fontScale === "number" && p.fontScale >= 0.7 && p.fontScale <= 1.5, "fontScale 须在 0.7~1.5");
        if (p?.width !== undefined) need(typeof p.width === "number" && p.width >= 120 && p.width <= 600, "width 须在 120~600");
        if (p?.height !== undefined) need(typeof p.height === "number" && p.height >= 100 && p.height <= 520, "height 须在 100~520");
        need(p && (p.fill !== undefined || p.stroke !== undefined || p.fontScale !== undefined || p.width !== undefined || p.height !== undefined), "patch 至少包含一项");
        break;
      }
      case "move_element": {
        need(nodeIds.has(c.nodeId), `未知节点: ${c.nodeId}`);
        need(typeof c.dx === "number" && Number.isFinite(c.dx), "dx 必须是数字");
        need(typeof c.dy === "number" && Number.isFinite(c.dy), "dy 必须是数字");
        need(Math.abs(c.dx) <= 800 && Math.abs(c.dy) <= 800, "单次移动不超过 800px");
        break;
      }
      case "set_spacing": {
        if (c?.reset !== true) need(typeof c.scale === "number" && c.scale >= 0.6 && c.scale <= 1.6, "scale 须在 0.6~1.6（或 reset=true 恢复默认）");
        break;
      }
      case "relayout":
        need(c.scope === "local" || c.scope === "all", "relayout scope 无效");
        break;
      default:
        issues.push({ changeIndex: i, message: "未知变更类型" });
    }
  });
  return issues;
}

function applyOne(g: KnowledgeGraph, c: GraphChange): string | null {
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
    case "add_node": {
      // 新节点 ID 服务端确定性生成：按 label 派生，重名加序号，保证与既有节点不冲突
      const baseId = `n-${c.label.trim().slice(0, 20).replace(/[^a-zA-Z0-9一-鿿_-]/g, "-")}`;
      let id = baseId, serial = 2;
      while (g.nodes.some((n) => n.id === id)) id = `${baseId}-${serial++}`;
      const node = { id, label: c.label.trim().slice(0, 40), description: c.description.trim().slice(0, 200), citations: [] as string[] };
      if (c.groupId) {
        const grp = findGroup(g, c.groupId)!;
        g.nodes.push({ ...node, group: grp.id });
        grp.nodeIds.push(id);
      } else {
        g.nodes.push(node);
      }
      return `新增了「${node.label}」`;
    }
    case "add_group": {
      // 新建分组并把成员移进去；label 为空字符串 = 大卡片容器（渲染层画包住成员卡的大框，不改版式归属）
      const isContainer = !c.label.trim();
      const idBase = isContainer ? "wrap" : "grp";
      let id = idBase, serial = 1;
      while (g.groups.some((grp) => grp.id === id)) id = `${idBase}-${serial++}`;
      const members = [...new Set(c.nodeIds)];
      if (!isContainer) {
        // 普通分组：成员先退出旧分组，避免一张卡同时属于两列/两簇
        g.groups.forEach((grp) => { grp.nodeIds = grp.nodeIds.filter((nid) => !members.includes(nid)); });
        members.forEach((nid) => { findNode(g, nid)!.group = id; });
      }
      g.groups.push({ id, label: c.label.trim().slice(0, 30), nodeIds: members });
      if (isContainer) {
        // 容器分组登记到 metadata.groupContainers，渲染层按成员卡包围盒画大框
        const containers = Array.isArray(g.metadata?.groupContainers) ? (g.metadata.groupContainers as unknown[]).filter((x): x is string => typeof x === "string") : [];
        g.metadata = { ...g.metadata, groupContainers: [...containers.filter((x) => x !== id), id] };
        return `已用大卡片包住 ${members.length} 张卡片`;
      }
      return `新建分组「${c.label.trim()}」（${members.length} 张卡片）`;
    }
    case "add_edge": {
      // 已存在同向边则只从 removedEdges 里恢复（可逆）；否则新增
      const key = edgeKey(c.fromId, c.toId);
      const removed = removedEdgeSet(g);
      // 装饰连线（lane-N→lane-M / question→debate-consensus / evidence-root→节点）不进 graph.edges，只清 removedEdges
      // P30 修复：任一端不在 nodes 里即为装饰边（question 在 nodes 里但 debate-consensus 不在）
      const isDecorative = !g.nodes.some((n) => n.id === c.fromId) || !g.nodes.some((n) => n.id === c.toId);
      // 泳道装饰箭头恢复时，连 remove_edges 派生的 lane-arrow-N 记录一起清掉
      const laneFrom = LANE_ARROW_RE.exec(c.fromId);
      if (laneFrom && LANE_ARROW_RE.test(c.toId)) removed.delete(edgeKey(`lane-arrow-${laneFrom[0].slice(5)}`, c.toId));
      if (removed.delete(key) || laneFrom) {
        g.metadata = { ...g.metadata, removedEdges: [...removed] };
        if (!isDecorative && !g.edges.some((e) => e.fromId === c.fromId && e.toId === c.toId)) {
          g.edges.push({ fromId: c.fromId, toId: c.toId });
        }
        return "已恢复这条连线";
      }
      if (isDecorative) return "这条连线本来就在";
      const exists = g.edges.some((e) => e.fromId === c.fromId && e.toId === c.toId);
      if (exists) return "这两张卡片之间本来就有连线";
      g.edges.push({ fromId: c.fromId, toId: c.toId });
      return "已加上连线";
    }
    case "remove_edges": {
      const removed = removedEdgeSet(g);
      let actuallyRemoved = 0;
      for (const p of c.pairs) {
        const key = edgeKey(p.fromId, p.toId);
        // 已被去掉过的连线：幂等，不重复记录
        if (removed.has(key)) continue;
        // P31：验证 pair 是否真的存在于图上——edges 里有，或者是渲染层推导的装饰箭头
        const existsInEdges = g.edges.some((e) => e.fromId === p.fromId && e.toId === p.toId);
        const isDecorative = !g.nodes.some((n) => n.id === p.fromId) || !g.nodes.some((n) => n.id === p.toId);
        const laneFrom = LANE_ARROW_RE.exec(p.fromId);
        const laneTo = LANE_ARROW_RE.exec(p.toId);
        const isLaneArrow = Boolean(laneFrom && laneTo);
        // 既不在 edges 里，也不是装饰箭头/泳道箭头 → 这条连线图上根本不存在，跳过
        if (!existsInEdges && !isDecorative && !isLaneArrow) continue;
        removed.add(key);
        g.edges = g.edges.filter((e) => !(e.fromId === p.fromId && e.toId === p.toId));
        // 泳道装饰箭头：lane-N → lane-(N+1) 是渲染层推导的，graph.edges 里没有，靠 removedEdges 隐藏
        if (isLaneArrow && laneFrom && laneTo) removed.add(edgeKey(`lane-arrow-${laneFrom[0].slice(5)}`, p.toId));
        actuallyRemoved += 1;
      }
      if (actuallyRemoved === 0) return null; // 一条都没删掉——视为无变更
      g.metadata = { ...g.metadata, removedEdges: [...removed] };
      return `去掉了 ${actuallyRemoved} 条连线（说「恢复连线」可还原）`;
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
      if (c.patch.layout) {
        g.kind = c.patch.layout;
        // 版式切换 = 全量重排：单卡微移偏移失效，清空防错位
        if (g.metadata?.elementOffsets && Object.keys(g.metadata.elementOffsets).length > 0) {
          g.metadata = { ...g.metadata, elementOffsets: {} };
        }
      }
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
    case "set_node_style": {
      // P30 微调：单卡样式覆盖 → node.metadata.styleOverrides（渲染层 card()/cardHeight() 读取）
      const n = findNode(g, c.nodeId)!;
      const prev = (n.metadata?.styleOverrides ?? {}) as Partial<NodeStylePatch>;
      n.metadata = { ...n.metadata, styleOverrides: { ...prev, ...c.patch } };
      const parts: string[] = [];
      if (c.patch.fill) parts.push("底色");
      if (c.patch.stroke) parts.push("描边色");
      if (c.patch.fontScale !== undefined) parts.push("字号");
      if (c.patch.width !== undefined) parts.push("宽度");
      if (c.patch.height !== undefined) parts.push("高度");
      return `已调整「${n.label}」的${parts.join("、")}`;
    }
    case "move_element": {
      // P30 微调：单卡位置偏移 → graph.metadata.elementOffsets[nodeId]（渲染层叠加在布局坐标上）
      const n = findNode(g, c.nodeId)!;
      const raw = (g.metadata?.elementOffsets ?? {}) as Record<string, { dx: number; dy: number }>;
      if (c.reset) {
        delete raw[c.nodeId];
        g.metadata = { ...g.metadata, elementOffsets: raw };
        return `「${n.label}」已回到默认位置`;
      }
      const prev = raw[c.nodeId] ?? { dx: 0, dy: 0 };
      const clamp = (v: number) => Math.max(-800, Math.min(800, v));
      raw[c.nodeId] = { dx: clamp(prev.dx + c.dx), dy: clamp(prev.dy + c.dy) };
      g.metadata = { ...g.metadata, elementOffsets: raw };
      const dir = [];
      if (c.dx !== 0) dir.push(c.dx < 0 ? `左移 ${Math.abs(c.dx)}px` : `右移 ${c.dx}px`);
      if (c.dy !== 0) dir.push(c.dy < 0 ? `上移 ${Math.abs(c.dy)}px` : `下移 ${c.dy}px`);
      return `「${n.label}」已${dir.join("、") || "微调位置"}（说「回到原位」可还原）`;
    }
    case "set_spacing": {
      // P30 微调：全局间距系数 → graph.metadata.spacingScale（positions() 所有布局的 gap 乘以它）
      if (c.reset) {
        if (g.metadata) delete g.metadata.spacingScale;
        return "卡片间距已恢复默认";
      }
      g.metadata = { ...g.metadata, spacingScale: c.scale! };
      return c.scale! > 1 ? `卡片间距已放宽（${Math.round((c.scale! - 1) * 100)}%）` : c.scale! < 1 ? `卡片间距已收紧（${Math.round((1 - c.scale!) * 100)}%）` : "卡片间距已恢复默认";
    }
    case "relayout":
      // 全量重排：单卡微移偏移一并清空（重排后旧偏移没有意义）
      if (c.scope === "all" && g.metadata?.elementOffsets && Object.keys(g.metadata.elementOffsets).length > 0) {
        g.metadata = { ...g.metadata, elementOffsets: {} };
      }
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
  let anyChanged = false;
  try {
    changes.forEach((c, i) => {
      const label = applyOne(next, c);
      if (label === null) return; // 无实际变更（如连线图上不存在）
      anyChanged = true;
      applied.push(`操作${i + 1}：${label}`);
    });
    if (!anyChanged) {
      return { ok: false, graph, applied: [], issues: [{ changeIndex: -1, message: "没有可执行的变更（连线在图上不存在）" }] };
    }
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
