// Harness 契约类型：多源编排的统一类型系统
// Planner 不调用模型；所有类型为确定性校验而设计

export type IntentKind =
  | "compare"
  | "roadmap"
  | "timeline"
  | "concept-map"
  | "argument-map"
  | "summary-board";

export type SourceId =
  | "picked"
  | "zhihu-search"
  | "global-search"
  | "zhihu-knowledge"
  | "hot-list"
  | "zhida";

export type LayoutKind =
  | "debate-grid"
  | "radial-map"
  | "timeline"
  | "swimlane-roadmap"
  | "cluster-board"
  | "evidence-tree";

export type PaletteId =
  | "zhihu-blue"
  | "paper-pastel"
  | "research-mono"
  | "poster-bold"
  | "nature-notes";

export type Density = "compact" | "comfortable" | "spacious";
export type StrokeStyle = "clean" | "sketch" | "marker";

export interface HierarchyScale {
  title: number;
  keyFinding: number;
  evidence: number;
}

export interface PresentationSpec {
  palette: PaletteId;
  density: Density;
  stroke: StrokeStyle;
  hierarchy: HierarchyScale;
  layout?: LayoutKind;  // optional override for RunPlan.layout
  style?: string; // style id, must not replace palette
}

export interface HarnessBudget {
  queryCount: number;
  docs: number;
  charsPerDoc: number;
  modelCalls: number;
  millis: number;
}

export interface SynthesisRequirement {
  fields: string[];
  requirements: string[];
}

export interface RunPlan {
  intent: IntentKind;
  queries: string[];
  sources: SourceId[];
  synthesis: SynthesisRequirement;
  layout: LayoutKind;
  style: PaletteId;
  budget: HarnessBudget;
  presentation?: PresentationSpec;
}

export type HarnessEventType =
  | "planning"
  | "searching"
  | "sources"
  | "synthesizing"
  | "laying_out"
  | "validating"
  | "graph"
  | "error";

export interface HarnessEvent {
  type: HarnessEventType;
  data: unknown;
}

export interface Citation {
  id: string;
  sourceIndex: number;
  url: string;
  title: string;
}

export interface SourceDocument {
  id: string;
  title: string;
  url: string;
  text: string;
  author: string;
  sourceType: SourceId;
  score: number;
  publishedAt: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  description: string;
  group?: string;
  citations: string[];
  emphasis?: "low" | "normal" | "high";
  metadata?: Record<string, unknown>;
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
  kind: LayoutKind;
  title: string;
  summary: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  groups: KnowledgeGroup[];
  citations: Citation[];
  presentation: PresentationSpec;
  metadata?: Record<string, unknown>;
}

export interface PlanInput {
  query: string;
  intent?: string;
  source?: string;     // deprecated, kept for backward compat
  sources?: string[];
  layout?: string;
  style?: string;
  queries?: string[];
  budget?: Partial<HarnessBudget>;
}