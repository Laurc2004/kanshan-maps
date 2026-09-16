// Agent 2.0 统一类型：面向用户的语义化变化，不暴露底层 Partial patch
import type { KnowledgeGraph, PresentationSpec } from "../harness/types.ts";

export type Emphasis = "low" | "normal" | "high";

// P30 微调：单卡样式覆盖 patch（layouts.ts nodeStyleOverrides 按同口径 clamp）
export interface NodeStylePatch {
  fill?: string;      // #RRGGBB 卡片底色
  stroke?: string;    // #RRGGBB 卡片描边色
  fontScale?: number; // 0.7~1.5 字号缩放（1.2=大 20%）
  width?: number;     // 120~600 绝对宽 px
  height?: number;    // 100~520 最小高 px
}

export type GraphChange =
  | { type: "rename_graph"; title: string }
  | { type: "rename_node"; nodeId: string; label: string }
  | { type: "rewrite_node_description"; nodeId: string; description: string }
  | { type: "emphasize_node"; nodeId: string; level: Emphasis }
  | { type: "add_node"; label: string; description: string; groupId?: string | null } // 新增一张卡片（学习路线加第 4 点等）；id 服务端生成
  | { type: "add_group"; label: string; nodeIds: string[] } // 新建分组；label 为空字符串 = 大卡片容器（包住成员卡，只起分组作用）
  | { type: "move_node"; nodeId: string; groupId: string | null }
  | { type: "remove_nodes"; nodeIds: string[]; reasons: string[] }
  | { type: "merge_nodes"; nodeIds: string[]; targetLabel: string; description: string }
  | { type: "add_edge"; fromId: string; toId: string } // 补一条连线（泳道/思维导图等场景）
  | { type: "remove_edges"; pairs: Array<{ fromId: string; toId: string }>; reason: string } // 去掉某点到某点的箭头；记入 metadata.removedEdges 对固定装饰箭头（泳道→泳道、胶囊→共识）同样生效，且可逆
  | { type: "rewrite_consensus"; items: string[] }
  | { type: "set_presentation"; patch: Partial<PresentationSpec> }
  | { type: "set_mode"; mode: "summary" | null } // 版式切换：summary=思维导图（中心主题+左右分支）；null=还原证据树
  | { type: "set_links"; enabled: boolean } // 卡片原文超链接开关（false=去除所有卡片链接，保留底部来源索引）
  | { type: "set_node_style"; nodeId: string; patch: NodeStylePatch } // P30 微调：单卡样式（颜色/字号/宽高），存 node.metadata.styleOverrides
  | { type: "move_element"; nodeId: string; dx: number; dy: number; reset?: boolean } // P30 微调：单卡微移（像素，±800 clamp），存 graph.metadata.elementOffsets；reset=true 清除该卡偏移
  | { type: "set_spacing"; scale?: number; reset?: boolean } // P30 微调：全局卡片间距系数（0.6~1.6），存 graph.metadata.spacingScale；reset=true 恢复默认
  | { type: "relayout"; scope: "local" | "all" };

export type Risk = "low" | "medium" | "high";

export type AgentDecision =
  | {
      type: "apply";
      reply: string;
      changes: GraphChange[];
      risk: "low" | "medium";
    }
  | {
      type: "preview";
      reply: string;
      changes: GraphChange[];
      risk: "high";
      confirmation: string; // 给用户看的确认文案
    }
  | { type: "answer"; reply: string }
  | { type: "clarify"; reply: string; questions: string[] };

export type AgentIntent =
  | "rename"
  | "style"
  | "emphasize"
  | "rewrite"
  | "structure"
  | "answer"
  | "clarify";

export interface AgentContext {
  graphVersion: string;
  title: string;
  summary: string;
  kind: KnowledgeGraph["kind"]; // 当前版式（决定「换成思维导图」需要哪些变更）
  mode?: string; // metadata.mode（summary = 思维导图分支）
  nodes: Array<{
    id: string;
    label: string;
    group?: string;
    description: string;
    emphasis?: string;
  }>;
  edges: Array<{ fromId: string; toId: string }>; // 连线（含数据型边）；空 label 分组按 ID 白名单给出，模型可按 ID 操作
  groups: Array<{ id: string; label: string; nodeIds: string[] }>;
  recentChanges: string[];
  selectedNodeIds?: string[];
  removedEdges?: string[]; // 被删连线集合（"fromId→toId"），恢复连线时用
}

export function buildAgentContext(graph: KnowledgeGraph, recentChanges: string[] = []): AgentContext {
  return {
    graphVersion: `${graph.nodes.length}n/${graph.edges.length}e`,
    title: graph.title,
    summary: graph.summary,
    kind: graph.kind,
    mode: typeof graph.metadata?.mode === "string" ? graph.metadata.mode : undefined,
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      group: n.group,
      description: n.description,
      emphasis: n.emphasis,
    })),
    groups: graph.groups.map((g) => ({ id: g.id, label: g.label, nodeIds: g.nodeIds })),
    edges: graph.edges.map((e) => ({ fromId: e.fromId, toId: e.toId })),
    recentChanges: recentChanges.slice(-5),
    removedEdges: Array.isArray(graph.metadata?.removedEdges)
      ? (graph.metadata.removedEdges as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function graphHash(graph: KnowledgeGraph): string {
  // 轻量确定性 hash（FNV-1a over JSON）；用于版本冲突检测，不做密码学用途
  const s = JSON.stringify({
    t: graph.title,
    n: graph.nodes.map((n) => [n.id, n.label, n.description, n.group, n.emphasis]),
    e: graph.edges.map((e) => [e.fromId, e.toId]),
    g: graph.groups.map((g) => [g.id, g.label, g.nodeIds]),
    p: graph.presentation,
  });
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
