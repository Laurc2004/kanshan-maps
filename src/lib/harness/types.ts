// Harness 契约类型：多源编排的统一类型系统
// Planner 不调用模型；所有类型为确定性校验而设计

export type IntentKind =
  | "learning"
  | "time/evolution"
  | "controversy"
  | "general";

export type SourceId = "zhihu" | "web" | "zhihu-knowledge" | "picked";

export type LayoutKind =
  | "concept-map"
  | "roadmap"
  | "timeline"
  | "compare"
  | "debate-grid"
  | "swimlane-roadmap"
  | "cluster-board"
  | "evidence-tree";

export type PresentationStyle = "default" | "monochrome" | "pastel" | "bold";

export interface PresentationSpec {
  layout: LayoutKind;
  style: PresentationStyle;
  density?: "compact" | "normal" | "spacious";
  stroke?: "thin" | "normal" | "thick";
  hierarchy?: "flat" | "nested" | "deep";
}

export interface HarnessBudget {
  docs: number;
  modelCalls: number;
  millis: number;
}

export interface RunPlan {
  intent: IntentKind;
  queries: string[];
  source: SourceId;
  layout: LayoutKind;
  style: PresentationStyle;
  budget: HarnessBudget;
  presentation?: PresentationSpec;
}

export type HarnessEventType =
  | "planning"
  | "searching"
  | "sources"
  | "synthesizing"
  | "validating"
  | "graph"
  | "error";

export interface HarnessEvent {
  type: HarnessEventType;
  data: unknown;
}

export interface SourceDocument {
  id: string;
  url: string;
  title: string;
  content: string;
  source: SourceId;
  authors?: string[];
  publishedAt?: string;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  description: string;
  group?: string;
  citations: string[];
  emphasis?: "low" | "normal" | "high";
}

export interface KnowledgeEdge {
  fromId: string;
  toId: string;
  label?: string;
  emphasis?: "low" | "normal" | "high";
}

export interface KnowledgeGroup {
  id: string;
  label: string;
  nodeIds: string[];
}

export interface KnowledgeGraph {
  title: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  groups: KnowledgeGroup[];
  presentation: PresentationSpec;
  sources: SourceDocument[];
}

export interface PlanInput {
  query: string;
  intent?: string;
  source?: string;
  layout?: string;
  style?: string;
  queries?: string[];
  budget?: Partial<HarnessBudget>;
}