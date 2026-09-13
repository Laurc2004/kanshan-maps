import type { KnowledgeGraph } from "./harness/types.ts";
import type { RoadmapGraph } from "./roadmap.ts";
import type { ViewpointGraph } from "./viewpoints.ts";
import { roadmapToKnowledgeGraph, viewpointToKnowledgeGraph } from "./harness/compat.ts";

export type AgentGraph = ViewpointGraph | RoadmapGraph | KnowledgeGraph;

export function isKnowledgeGraph(value: unknown): value is KnowledgeGraph {
  const graph = value as KnowledgeGraph | null;
  return !!graph && typeof graph === "object" && typeof graph.title === "string" && Array.isArray(graph.nodes)
    && Array.isArray(graph.edges) && Array.isArray(graph.groups) && Array.isArray(graph.citations)
    && !!graph.presentation;
}

export function isRoadmapGraph(value: unknown): value is RoadmapGraph {
  const graph = value as RoadmapGraph | null;
  return !!graph && typeof graph === "object" && graph.kind === "roadmap"
    && typeof graph.topic === "string" && Array.isArray(graph.stages);
}

export function isViewpointGraph(value: unknown): value is ViewpointGraph {
  const graph = value as ViewpointGraph | null;
  return !!graph && typeof graph === "object" && typeof graph.question === "string"
    && Array.isArray(graph.consensus) && Array.isArray(graph.viewpoints);
}

/** Convert every supported client snapshot to the Agent 2.0 IR. */
export function normalizeAgentGraph(value: unknown): KnowledgeGraph | null {
  if (isKnowledgeGraph(value)) return value;
  if (isRoadmapGraph(value)) return roadmapToKnowledgeGraph(value);
  if (isViewpointGraph(value)) return viewpointToKnowledgeGraph(value);
  return null;
}

export function hasAgentGraph(value: unknown): value is AgentGraph {
  return isKnowledgeGraph(value) || isRoadmapGraph(value) || isViewpointGraph(value);
}
