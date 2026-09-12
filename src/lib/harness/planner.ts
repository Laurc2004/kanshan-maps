// 确定性 Planner：纯函数，不调用模型
// fallbackPlan 根据规则降级；validatePlan 校验候选计划的约束

import type {
  IntentKind, LayoutKind, RunPlan, PlanInput, SourceId, PaletteId,
  SynthesisRequirement, HarnessBudget,
} from "./types.ts";

const ALLOWED_INTENTS: IntentKind[] = [
  "compare", "roadmap", "timeline", "concept-map", "argument-map", "summary-board",
];
const ALLOWED_SOURCES: SourceId[] = [
  "picked", "zhihu-search", "global-search", "zhihu-knowledge", "hot-list", "zhida",
];
const ALLOWED_LAYOUTS: LayoutKind[] = [
  "debate-grid", "radial-map", "timeline", "swimlane-roadmap", "cluster-board", "evidence-tree",
];
const ALLOWED_STYLES: PaletteId[] = [
  "zhihu-blue", "paper-pastel", "research-mono", "poster-bold", "nature-notes",
];

const MAX_QUERIES = 3;
const MAX_DOCS = 12;
const MAX_CHARS_PER_DOC = 8000;
const MAX_QUERY_COUNT = 6;
const MAX_MODEL_CALLS = 3;
const MAX_MILLIS = 120_000;

function clamp<T>(value: T | undefined, allowed: readonly T[], fallback: T): T {
  if (value !== undefined && allowed.includes(value)) return value;
  return fallback;
}

function detectIntent(query: string, explicit?: string): IntentKind {
  // Unknown explicit intent falls back to concept-map (no keyword guessing).
  if (explicit !== undefined && !ALLOWED_INTENTS.includes(explicit as IntentKind)) {
    return "concept-map";
  }
  // If an explicit valid intent is provided, use it
  if (explicit && ALLOWED_INTENTS.includes(explicit as IntentKind)) {
    return explicit as IntentKind;
  }

  // Degrade based on query content
  const q = query.toLowerCase();

  // Learning: 学习, 入门, 零基础, 教程, beginners, tutorial, learn
  if (/零基础|入门|学习|教程|learn/i.test(q) && !/争议|区别|对比|演变|历史/i.test(q)) {
    return "roadmap";
  }

  // Time/evolution: 演变, 发展, 历史, 历年, timeline, evolution, history
  if (/演变|发展历史|历年|历程|演进|evolution|history of/i.test(q)) {
    return "timeline";
  }

  // Controversy: 争议, 对比, 区别, 哪个好, 选, vs, versus, controversy, comparison
  if (/争议|对比|区别|哪个好|选|vs|or|还是|怎么选/i.test(q)) {
    return "compare";
  }

  return "concept-map";
}

function pickLayout(intent: IntentKind, explicit?: string): LayoutKind {
  if (explicit && ALLOWED_LAYOUTS.includes(explicit as LayoutKind)) {
    return explicit as LayoutKind;
  }
  switch (intent) {
    case "roadmap": return "swimlane-roadmap";
    case "timeline": return "timeline";
    case "compare": return "debate-grid";
    case "concept-map": return "radial-map";
    case "argument-map": return "evidence-tree";
    case "summary-board": return "cluster-board";
  }
}

function defaultSynthesis(intent: IntentKind): SynthesisRequirement {
  switch (intent) {
    case "compare":
      return { fields: ["viewpoint", "evidence", "source"], requirements: ["至少两个对立观点", "每观点附来源"] };
    case "roadmap":
      return { fields: ["step", "description", "prerequisites"], requirements: ["按阶段递进", "明确前置条件"] };
    case "timeline":
      return { fields: ["event", "date", "significance"], requirements: ["按时间顺序", "标注关键转折点"] };
    case "argument-map":
      return { fields: ["claim", "premise", "rebuttal"], requirements: ["结论前置", "论据分层展开"] };
    case "summary-board":
      return { fields: ["topic", "keyPoints", "connections"], requirements: ["主题聚类", "知识点互联"] };
    default: // concept-map
      return { fields: ["concept", "definition", "relation"], requirements: ["核心概念为中心", "渐进展开"] };
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

  // Build sources priority array: prefer explicit sources[], fall back to deprecated source
  let sources: SourceId[];
  if (input.sources && input.sources.length > 0) {
    sources = input.sources
      .filter((s): s is SourceId => ALLOWED_SOURCES.includes(s as SourceId))
      .slice(0, 3);
    if (sources.length === 0) {
      sources = ["zhihu-search"] as SourceId[];
    }
  } else {
    const source = clamp(input.source, ALLOWED_SOURCES, "zhihu-search") as SourceId;
    sources = [source];
  }

  const layout = pickLayout(intent, input.layout);
  const style = clamp(input.style, ALLOWED_STYLES, "zhihu-blue") as PaletteId;
  const synthesis = defaultSynthesis(intent);

  const budget: HarnessBudget = {
    queryCount: Math.min(input.budget?.queryCount ?? MAX_QUERY_COUNT, MAX_QUERY_COUNT),
    docs: Math.min(input.budget?.docs ?? MAX_DOCS, MAX_DOCS),
    charsPerDoc: Math.min(input.budget?.charsPerDoc ?? MAX_CHARS_PER_DOC, MAX_CHARS_PER_DOC),
    modelCalls: Math.min(input.budget?.modelCalls ?? MAX_MODEL_CALLS, MAX_MODEL_CALLS),
    millis: Math.min(input.budget?.millis ?? MAX_MILLIS, MAX_MILLIS),
  };

  return { intent, queries, sources, synthesis, layout, style, budget };
}

export interface ValidationResult {
  ok: true;
  plan: RunPlan;
  warnings?: string[];
}

export interface ValidationError {
  ok: false;
  errors: string[];
}

/**
 * 校验候选 RunPlan 是否满足所有约束。
 * 同时将输入中的显式意图/来源/布局/样式与候选进行交叉校验，差异时发出警告。
 * 返回 { ok, plan, warnings? } 或 { ok, errors }。
 */
export function validatePlan(candidate: RunPlan, input: PlanInput): ValidationResult | ValidationError {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!ALLOWED_INTENTS.includes(candidate.intent)) {
    errors.push(`Invalid intent: ${candidate.intent}`);
  }
  if (!Array.isArray(candidate.sources) || candidate.sources.length === 0) {
    errors.push("Must have at least one source");
  } else {
    for (const s of candidate.sources) {
      if (!ALLOWED_SOURCES.includes(s)) {
        errors.push(`Invalid source: ${s}`);
      }
    }
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
    if (candidate.budget.charsPerDoc > MAX_CHARS_PER_DOC) {
      errors.push(`Budget charsPerDoc exceeded: ${candidate.budget.charsPerDoc} > ${MAX_CHARS_PER_DOC}`);
    }
    if (candidate.budget.queryCount > MAX_QUERY_COUNT) {
      errors.push(`Budget queryCount exceeded: ${candidate.budget.queryCount} > ${MAX_QUERY_COUNT}`);
    }
    if (candidate.budget.millis > MAX_MILLIS) {
      errors.push(`Budget millis exceeded: ${candidate.budget.millis} > ${MAX_MILLIS}`);
    }
  }

  // Cross-validate explicit input fields against candidate
  if (input.intent && ALLOWED_INTENTS.includes(input.intent as IntentKind) && candidate.intent !== input.intent) {
    warnings.push(`Input intent "${input.intent}" differs from candidate intent "${candidate.intent}"`);
  }
  if (input.layout && ALLOWED_LAYOUTS.includes(input.layout as LayoutKind) && candidate.layout !== input.layout) {
    warnings.push(`Input layout "${input.layout}" differs from candidate layout "${candidate.layout}"`);
  }
  if (input.style && ALLOWED_STYLES.includes(input.style as PaletteId) && candidate.style !== input.style) {
    warnings.push(`Input style "${input.style}" differs from candidate style "${candidate.style}"`);
  }
  // Cross-validate explicit sources against candidate sources
  const candidateSourceSet = new Set(candidate.sources);
  if (input.sources && input.sources.length > 0) {
    const inputSources = input.sources.filter((s): s is SourceId => ALLOWED_SOURCES.includes(s as SourceId));
    const inputSourceSet = new Set(inputSources);
    const differs = inputSourceSet.size !== candidateSourceSet.size
      || [...inputSourceSet].some(s => !candidateSourceSet.has(s));
    if (differs) {
      warnings.push(`Input sources [${inputSources.join(",")}] differ from candidate sources [${candidate.sources.join(",")}]`);
    }
  } else if (input.source && ALLOWED_SOURCES.includes(input.source as SourceId)) {
    if (!candidateSourceSet.has(input.source as SourceId)) {
      warnings.push(`Input source "${input.source}" differs from candidate sources [${candidate.sources.join(",")}]`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const result: ValidationResult = { ok: true, plan: candidate };
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}