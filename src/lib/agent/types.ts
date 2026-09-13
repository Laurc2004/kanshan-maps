// Agent 2.0 统一类型：面向用户的语义化变化，不暴露底层 Partial patch
import type { KnowledgeGraph, PresentationSpec } from "../harness/types.ts";

export type Emphasis = "low" | "normal" | "high";

export type GraphChange =
  | { type: "rename_graph"; title: string }
  | { type: "rename_node"; nodeId: string; label: string }
  | { type: "rewrite_node_description"; nodeId: string; description: string }
  | { type: "emphasize_node"; nodeId: string; level: Emphasis }
  | { type: "move_node"; nodeId: string; groupId: string | null }
  | { type: "remove_nodes"; nodeIds: string[]; reasons: string[] }
  | { type: "merge_nodes"; nodeIds: string[]; targetLabel: string; description: string }
  | { type: "rewrite_consensus"; items: string[] }
  | { type: "set_presentation"; patch: Partial<PresentationSpec> }
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
  nodes: Array<{
    id: string;
    label: string;
    group?: string;
    description: string;
    emphasis?: string;
  }>;
  groups: Array<{ id: string; label: string; nodeIds: string[] }>;
  recentChanges: string[];
  selectedNodeIds?: string[];
}

export function buildAgentContext(graph: KnowledgeGraph, recentChanges: string[] = []): AgentContext {
  return {
    graphVersion: `${graph.nodes.length}n/${graph.edges.length}e`,
    title: graph.title,
    summary: graph.summary,
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      group: n.group,
      description: n.description,
      emphasis: n.emphasis,
    })),
    groups: graph.groups.map((g) => ({ id: g.id, label: g.label, nodeIds: g.nodeIds })),
    recentChanges: recentChanges.slice(-5),
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
