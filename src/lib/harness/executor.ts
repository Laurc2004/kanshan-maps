import { fallbackPlan as defaultFallbackPlan, validatePlan as defaultValidatePlan, buildComparePlan, buildRoadmapPlan } from "./planner.ts";
import { collectSources as defaultCollectSources } from "./sources.ts";
import type { CollectResult, CollectSourcesInput, Fetchers } from "./sources.ts";
import { pruneFillerNodes, synthesizeDetails, synthesizeSkeleton } from "./synthesizer.ts";
import type {
  HarnessBudget,
  HarnessEvent,
  KnowledgeGraph,
  PlanInput,
  RunPlan,
  SourceDocument,
} from "./types.ts";

export interface HarnessInput extends PlanInput {
  picked?: SourceDocument[];
  engine: { id: "builtin" | "custom" | "zhida"; baseURL?: string; apiKey?: string; model?: string };
  fetchers?: Fetchers;
  signal?: AbortSignal;
}

type PlanValidation =
  | { ok: true; plan: RunPlan; warnings?: string[] }
  | { ok: false; errors: string[] };

export interface HarnessDependencies {
  fallbackPlan?: (input: PlanInput) => RunPlan;
  validatePlan?: (candidate: RunPlan, input: PlanInput) => PlanValidation;
  collectSources?: (
    input: CollectSourcesInput,
    budget?: Partial<HarnessBudget> | { budget?: Partial<HarnessBudget> },
    fetchers?: Fetchers,
    signal?: AbortSignal,
  ) => Promise<CollectResult>;
  synthesize?: (
    documents: SourceDocument[],
    plan: RunPlan,
    options: { engine: HarnessInput["engine"] },
  ) => Promise<KnowledgeGraph>;
  // 两阶段综合（流式出图）：先骨架后详情。注入任一即可替换默认实现。
  synthesizeSkeleton?: (
    documents: SourceDocument[],
    plan: RunPlan,
    options: { engine: HarnessInput["engine"] },
  ) => Promise<KnowledgeGraph>;
  synthesizeDetails?: (
    skeleton: KnowledgeGraph,
    documents: SourceDocument[],
    options: { engine: HarnessInput["engine"] },
  ) => Promise<KnowledgeGraph>;
  supplementQuery?: (input: HarnessInput, plan: RunPlan, signal?: AbortSignal) => Promise<string | undefined>;
}

export type GenerationPath = "harness" | "legacy-viewpoint" | "legacy-roadmap";

export type UserMode = "compare" | "roadmap";

// 用户入口已收缩为 compare/roadmap 两种；旧值 auto/viewpoint 兼容映射
export function normalizeUserMode(value: unknown): UserMode {
  if (value === "roadmap") return "roadmap";
  return "compare"; // auto/viewpoint/compare/未知值 → compare
}

// 成熟单调用链路：compare→观点对照（一次 LLM）、roadmap→学习路线（一次 LLM）
// Harness 多阶段编排保留给 direct API 调用与实验（explicit intent 才走）
export function resolveGenerationPath(mode: unknown): GenerationPath {
  if (mode === "roadmap") return "legacy-roadmap";
  return "legacy-viewpoint";
}

function errorEvent(stage: string, error: unknown): HarnessEvent {
  return {
    type: "error",
    data: {
      stage,
      error: error instanceof Error ? error.message : String(error),
    },
  };
}

function abortError(signal?: AbortSignal): Error | undefined {
  return signal?.aborted ? new Error("Harness run aborted") : undefined;
}

function validateGraph(graph: KnowledgeGraph): void {
  // title 已在 parseKnowledgeGraph 回退补齐，这里只防真空白
  if (!graph.title.trim()) throw new Error("KnowledgeGraph title must not be empty");
  if (graph.nodes.length === 0) throw new Error("KnowledgeGraph nodes must not be empty");
}

export async function* runHarness(
  input: HarnessInput,
  dependencies: HarnessDependencies = {},
): AsyncGenerator<HarnessEvent> {
  // 双模式 Planner：compare/roadmap 各用各的专用计划，其余意图走 fallbackPlan 兼容
  const intentFromMode = normalizeUserMode((input as { mode?: unknown }).mode ?? input.intent);
  const makePlan = dependencies.fallbackPlan
    ?? (intentFromMode === "roadmap" ? buildRoadmapPlan : intentFromMode === "compare" ? buildComparePlan : defaultFallbackPlan);
  const validatePlan = dependencies.validatePlan ?? defaultValidatePlan;
  const collectSources = dependencies.collectSources ?? defaultCollectSources;
  let stage = "planning";

  try {
    const initialAbort = abortError(input.signal);
    if (initialAbort) throw initialAbort;

    const candidate = makePlan(input);
    const validation = validatePlan(candidate, input);
    if (!validation.ok) throw new Error(`Invalid harness plan: ${validation.errors.join("; ")}`);
    const plan = validation.plan;
    yield { type: "planning", data: { plan, warnings: validation.warnings ?? [] } };

    stage = "sources";
    yield { type: "searching", data: { queries: plan.queries, sources: plan.sources } };
    let sourceResult = await collectSources({
      query: input.query,
      queries: plan.queries,
      sources: plan.sources,
      picked: input.picked,
      budget: plan.budget,
    }, plan.budget, input.fetchers, input.signal);
    const sourceAbort = abortError(input.signal);
    if (sourceAbort) throw sourceAbort;
    yield { type: "sources", data: sourceResult };

    let modelCalls = 0;
    if (sourceResult.documents.length === 0 && dependencies.supplementQuery && modelCalls < plan.budget.modelCalls) {
      const supplementary = await dependencies.supplementQuery(input, plan, input.signal);
      const supplementAbort = abortError(input.signal);
      if (supplementAbort) throw supplementAbort;
      if (supplementary?.trim()) {
        yield { type: "searching", data: { queries: [supplementary.trim()], sources: plan.sources, supplementary: true } };
        const retry = await collectSources({
          query: input.query,
          queries: [supplementary.trim()],
          sources: plan.sources,
          picked: input.picked,
          budget: plan.budget,
        }, plan.budget, input.fetchers, input.signal);
        sourceResult = {
          documents: retry.documents,
          errors: [...sourceResult.errors, ...retry.errors],
        };
        const retryAbort = abortError(input.signal);
        if (retryAbort) throw retryAbort;
        yield { type: "sources", data: sourceResult };
      }
    }

    if (sourceResult.documents.length === 0) {
      yield errorEvent("sources", new Error("No usable source documents were found"));
      return;
    }

    stage = "synthesizing";
    if (modelCalls >= plan.budget.modelCalls) {
      yield errorEvent(stage, new Error("Model call budget exhausted before synthesis"));
      return;
    }
    modelCalls += 1;
    yield { type: "synthesizing", data: { documents: sourceResult.documents.length, modelCall: modelCalls, phase: "skeleton" } };

    let graph: KnowledgeGraph;
    if (dependencies.synthesize) {
      // 注入式（测试/特殊通道）：单次全量综合
      graph = await dependencies.synthesize(sourceResult.documents, plan, { engine: input.engine });
    } else {
      // 两阶段综合：骨架先到（卡片立刻落画板），详情后补（正文逐字填充）
      const skeleton = await (dependencies.synthesizeSkeleton ?? synthesizeSkeleton)(
        sourceResult.documents, plan, { engine: input.engine },
      );
      const skeletonAbort = abortError(input.signal);
      if (skeletonAbort) throw skeletonAbort;
      graph = skeleton;
      yield {
        type: "graph-skeleton",
        data: {
          graph: skeleton,
          mode: "auto",
          sources: sourceResult.documents.length,
          documents: sourceResult.documents,
          sourceErrors: sourceResult.errors,
        },
      };
      if (modelCalls < plan.budget.modelCalls) {
        modelCalls += 1;
        yield { type: "synthesizing", data: { documents: sourceResult.documents.length, modelCall: modelCalls, phase: "details" } };
        graph = await (dependencies.synthesizeDetails ?? synthesizeDetails)(
          skeleton, sourceResult.documents, { engine: input.engine },
        );
        const detailAbort = abortError(input.signal);
        if (detailAbort) throw detailAbort;
        yield { type: "graph-detail", data: { graph, mode: "auto" } };
      }
    }
    graph = pruneFillerNodes(graph);
    const synthesisAbort = abortError(input.signal);
    if (synthesisAbort) throw synthesisAbort;

    stage = "laying_out";
    yield { type: "laying_out", data: { layout: graph.presentation.layout ?? graph.kind } };

    stage = "validating";
    yield { type: "validating", data: { nodes: graph.nodes.length, edges: graph.edges.length } };
    validateGraph(graph);

    yield {
      type: "graph",
      data: {
        graph,
        mode: "auto",
        sources: sourceResult.documents.length,
        documents: sourceResult.documents,
        sourceErrors: sourceResult.errors,
      },
    };
  } catch (error) {
    yield errorEvent(input.signal?.aborted ? "aborted" : stage, error);
  }
}
