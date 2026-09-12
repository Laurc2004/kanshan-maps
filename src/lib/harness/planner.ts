// 确定性 Planner：纯函数，不调用模型
// fallbackPlan 根据规则降级；validatePlan 校验候选计划的约束

import type { IntentKind, LayoutKind, RunPlan, PlanInput, SourceId, PresentationStyle } from "./types.ts";

const ALLOWED_INTENTS: IntentKind[] = ["learning", "time/evolution", "controversy", "general"];
const ALLOWED_SOURCES: SourceId[] = ["zhihu", "web", "zhihu-knowledge", "picked"];
const ALLOWED_LAYOUTS: LayoutKind[] = [
  "concept-map", "roadmap", "timeline", "compare",
  "debate-grid", "swimlane-roadmap", "cluster-board", "evidence-tree",
];
const ALLOWED_STYLES: PresentationStyle[] = ["default", "monochrome", "pastel", "bold"];

const MAX_QUERIES = 3;
const MAX_DOCS = 12;
const MAX_MODEL_CALLS = 3;
const MAX_MILLIS = 120_000;

function clamp<T>(value: T | undefined, allowed: readonly T[], fallback: T): T {
  if (value !== undefined && allowed.includes(value)) return value;
  return fallback;
}

function detectIntent(query: string, explicit?: string): IntentKind {
  // If an explicit valid intent is provided, use it
  if (explicit && ALLOWED_INTENTS.includes(explicit as IntentKind)) {
    return explicit as IntentKind;
  }

  // Degrade based on query content
  const q = query.toLowerCase();

  // Learning: 学习, 入门, 零基础, 教程, beginners, tutorial, learn
  if (/零基础|入门|学习|教程|learn/i.test(q) && !/争议|区别|对比|演变|历史/i.test(q)) {
    return "learning";
  }

  // Time/evolution: 演变, 发展, 历史, 历年, timeline, evolution, history
  if (/演变|发展历史|历年|历程|演进|evolution|history of/i.test(q)) {
    return "time/evolution";
  }

  // Controversy: 争议, 对比, 区别, 哪个好, 选, vs, versus, controversy, comparison
  if (/争议|对比|区别|哪个好|选|vs|or|还是|怎么选/i.test(q)) {
    return "controversy";
  }

  return "general";
}

function pickLayout(intent: IntentKind, explicit?: string): LayoutKind {
  if (explicit && ALLOWED_LAYOUTS.includes(explicit as LayoutKind)) {
    return explicit as LayoutKind;
  }
  switch (intent) {
    case "learning": return "roadmap";
    case "time/evolution": return "timeline";
    case "controversy": return "compare";
    default: return "concept-map";
  }
}

/**
 * 纯函数 fallbackPlan：基于规则（不调用模型）生成 RunPlan。
 * 所有超出硬预算的值被裁剪到上限，非法值回落。
 */
export function fallbackPlan(input: PlanInput): RunPlan {
  const intent = detectIntent(input.query, input.intent);

  let queries: string[];
  if (input.queries && input.queries.length > 0) {
    queries = input.queries.slice(0, MAX_QUERIES);
  } else {
    queries = [input.query];
  }

  const source = clamp(input.source, ALLOWED_SOURCES, "zhihu") as SourceId;
  const layout = pickLayout(intent, input.layout);
  const style = clamp(input.style, ALLOWED_STYLES, "default") as PresentationStyle;

  const budget = {
    docs: Math.min(input.budget?.docs ?? MAX_DOCS, MAX_DOCS),
    modelCalls: Math.min(input.budget?.modelCalls ?? MAX_MODEL_CALLS, MAX_MODEL_CALLS),
    millis: Math.min(input.budget?.millis ?? MAX_MILLIS, MAX_MILLIS),
  };

  return { intent, queries, source, layout, style, budget };
}

export interface ValidationResult {
  ok: true;
  plan: RunPlan;
}

export interface ValidationError {
  ok: false;
  errors: string[];
}

/**
 * 校验候选 RunPlan 是否满足所有约束。
 * 返回 { ok, plan } 或 { ok, errors }。
 */
export function validatePlan(candidate: RunPlan, input: PlanInput): ValidationResult | ValidationError {
  // input 保留在契约中：Task 5 Executor 用其交叉校验候选计划与显式意图
  void input;
  const errors: string[] = [];

  if (!ALLOWED_INTENTS.includes(candidate.intent)) {
    errors.push(`Invalid intent: ${candidate.intent}`);
  }
  if (!ALLOWED_SOURCES.includes(candidate.source)) {
    errors.push(`Invalid source: ${candidate.source}`);
  }
  if (!ALLOWED_LAYOUTS.includes(candidate.layout)) {
    errors.push(`Invalid layout: ${candidate.layout}`);
  }
  if (!ALLOWED_STYLES.includes(candidate.style)) {
    errors.push(`Invalid style: ${candidate.style}`);
  }
  if (!Array.isArray(candidate.queries) || candidate.queries.length === 0) {
    errors.push("Must have at least one query");
  }
  if (candidate.queries.length > MAX_QUERIES) {
    errors.push(`Exceeded max queries: ${candidate.queries.length} > ${MAX_QUERIES}`);
  }
  if (!candidate.budget) {
    errors.push("Budget is required");
  } else {
    if (candidate.budget.docs > MAX_DOCS) {
      errors.push(`Budget docs exceeded: ${candidate.budget.docs} > ${MAX_DOCS}`);
    }
    if (candidate.budget.modelCalls > MAX_MODEL_CALLS) {
      errors.push(`Budget model calls exceeded: ${candidate.budget.modelCalls} > ${MAX_MODEL_CALLS}`);
    }
    if (candidate.budget.millis > MAX_MILLIS) {
      errors.push(`Budget millis exceeded: ${candidate.budget.millis} > ${MAX_MILLIS}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, plan: candidate };
}