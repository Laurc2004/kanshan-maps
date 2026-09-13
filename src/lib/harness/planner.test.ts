import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fallbackPlan, validatePlan } from "./planner.ts";
import type { PlanInput, RunPlan, LayoutKind, SourceId } from "./types.ts";

const MAX_QUERIES = 3;
const MAX_DOCS = 8;
const MAX_MODEL_CALLS = 3;
const MAX_CHARS_PER_DOC = 2600;

void describe("fallbackPlan rule-based degradation", () => {
  void it("degrades learning class input to roadmap intent / swimlane-roadmap layout", () => {
    const plan = fallbackPlan({ query: "如何零基础学习价值投资" });
    assert.equal(plan.intent, "roadmap");
    assert.equal(plan.layout, "swimlane-roadmap");
  });

  void it("handles an explicit roadmap intent", () => {
    const plan = fallbackPlan({ query: "随便", intent: "roadmap" });
    assert.equal(plan.layout, "swimlane-roadmap");
  });

  void it("degrades time/evolution input to timeline intent / timeline layout", () => {
    const plan = fallbackPlan({ query: "比特币历年价格演变的完整过程" });
    assert.equal(plan.intent, "timeline");
    assert.equal(plan.layout, "timeline");
  });

  void it("degrades controversy/comparison input to compare intent / debate-grid layout", () => {
    const plan = fallbackPlan({ query: "A股和港股到底哪个更好，究竟该怎么选" });
    assert.equal(plan.intent, "compare");
    assert.equal(plan.layout, "debate-grid");
  });

  void it("falls back to compare intent / debate-grid layout for an ordinary topic", () => {
    const plan = fallbackPlan({ query: "什么是量子计算" });
    assert.equal(plan.intent, "compare");
    assert.equal(plan.layout, "debate-grid");
  });

  void it("defaults intent to compare when an unknown intent is passed", () => {
    const plan = fallbackPlan({ query: "量子计算", intent: "banana" as PlanInput["intent"] });
    assert.equal(plan.intent, "compare");
    assert.equal(plan.layout, "debate-grid");
  });

  void it("falls unknown explicit intent back to compare even when query matches another fallback class", () => {
    const plan = fallbackPlan({ query: "如何零基础学习价值投资", intent: "banana" as PlanInput["intent"] });
    assert.equal(plan.intent, "compare");
    assert.equal(plan.layout, "debate-grid");
  });

  void it("maps argument-map intent to evidence-tree layout", () => {
    const plan = fallbackPlan({ query: "论证", intent: "argument-map" });
    assert.equal(plan.layout, "evidence-tree");
  });

  void it("maps summary-board intent to cluster-board layout", () => {
    const plan = fallbackPlan({ query: "总结", intent: "summary-board" });
    assert.equal(plan.layout, "cluster-board");
  });
});

void describe("fallbackPlan sources array", () => {
  void it("returns sources as a priority-ordered array with default zhihu-search", () => {
    const plan = fallbackPlan({ query: "价值投资" });
    assert.ok(Array.isArray(plan.sources));
    assert.equal(plan.sources[0], "zhihu-search");
  });

  void it("preserves valid provided source list", () => {
    const plan = fallbackPlan({ query: "x", sources: ["global-search", "zhida"] });
    assert.deepEqual(plan.sources, ["global-search", "zhida"]);
  });

  void it("filters invalid source values from sources list", () => {
    const plan = fallbackPlan({ query: "x", sources: ["garbage" as SourceId, "zhihu-knowledge"] });
    assert.equal(plan.sources.length, 1);
    assert.equal(plan.sources[0], "zhihu-knowledge");
  });

  void it("prefers explicit sources array over deprecated single source field", () => {
    const plan = fallbackPlan({ query: "x", source: "zhihu-search", sources: ["hot-list", "zhida"] });
    assert.deepEqual(plan.sources, ["hot-list", "zhida"]);
  });
});

void describe("fallbackPlan budget clamping", () => {
  void it("clamps queries to at most 3", () => {
    const plan = fallbackPlan({ query: "价值投资", intent: "concept-map", queries: ["a", "b", "c", "d", "e"] });
    assert.ok(plan.queries.length <= MAX_QUERIES, `queries must be <= ${MAX_QUERIES}`);
    assert.ok(plan.queries.length >= 1);
  });

  void it("fills queries with a usable query when empty", () => {
    const plan = fallbackPlan({ query: "价值投资", queries: [] });
    assert.equal(plan.queries.length, 1);
    assert.equal(plan.queries[0], "价值投资");
  });

  void it("includes charsPerDoc and queryCount in budget", () => {
    const plan = fallbackPlan({ query: "x" });
    assert.ok(typeof plan.budget.charsPerDoc === "number");
    assert.ok(typeof plan.budget.queryCount === "number");
    assert.ok(plan.budget.charsPerDoc > 0);
    assert.ok(plan.budget.queryCount > 0);
  });

  void it("clamps budget fields to hard caps", () => {
    const plan = fallbackPlan({
      query: "x",
      budget: { docs: 99, modelCalls: 50, millis: 9999999, charsPerDoc: 999999, queryCount: 50 },
    });
    assert.equal(plan.budget.docs, MAX_DOCS);
    assert.equal(plan.budget.modelCalls, MAX_MODEL_CALLS);
    assert.ok(plan.budget.charsPerDoc <= MAX_CHARS_PER_DOC, "charsPerDoc must not exceed hard cap");
    assert.ok(plan.budget.millis <= 120_000, "millis must not exceed the hard cap");
  });
});

void describe("fallbackPlan invalid value fallback", () => {
  void it("falls invalid single source back to zhihu-search", () => {
    const plan = fallbackPlan({ query: "x", source: "garbage" as PlanInput["source"] });
    assert.equal(plan.sources[0], "zhihu-search");
  });

  void it("falls invalid layout back to the intent default", () => {
    const plan = fallbackPlan({ query: "x", layout: "garbage" as PlanInput["layout"] });
    assert.equal(plan.layout, "debate-grid"); // intent 默认 compare → debate-grid
  });

  void it("falls invalid style back to zhihu-blue", () => {
    const plan = fallbackPlan({ query: "x", style: "garbage" as PlanInput["style"] });
    assert.equal(plan.style, "zhihu-blue");
  });

  void it("preserves valid provided values", () => {
    const plan = fallbackPlan({ query: "x", source: "zhida", layout: "timeline", style: "paper-pastel" });
    assert.equal(plan.sources[0], "zhida");
    assert.equal(plan.layout, "timeline");
    assert.equal(plan.style, "paper-pastel");
  });
});

void describe("validatePlan contract", () => {
  it("accepts a fully valid plan unchanged", () => {
    const input: PlanInput = { query: "量子计算" };
    const candidate: RunPlan = fallbackPlan(input);
    const result = validatePlan(candidate, input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.plan, candidate);
    }
  });

  it("rejects a candidate with excess queries", () => {
    const input: PlanInput = { query: "量子计算" };
    const bad: RunPlan = { ...fallbackPlan(input), queries: ["a", "b", "c", "d"] };
    const result = validatePlan(bad, input);
    assert.equal(result.ok, false);
  });

  void it("rejects a candidate that exceeds budget caps", () => {
    const input: PlanInput = { query: "量子计算" };
    const bad: RunPlan = {
      ...fallbackPlan(input),
      budget: { docs: 99, modelCalls: 99, millis: 999999, charsPerDoc: 99999, queryCount: 99 },
    };
    const result = validatePlan(bad, input);
    assert.equal(result.ok, false);
  });
  it("rejects a candidate whose layout is not allowed", () => {
    const input: PlanInput = { query: "x" };
    const bad: RunPlan = { ...fallbackPlan(input), layout: "banana" as LayoutKind };
    const result = validatePlan(bad, input);
    assert.equal(result.ok, false);
  });

  it("produces a warning when candidate intent differs from explicit input intent", () => {
    const input: PlanInput = { query: "x", intent: "timeline" };
    const base = fallbackPlan({ query: "学习价值投资" });
    const candidate: RunPlan = { ...base, intent: "roadmap" };
    const result = validatePlan(candidate, input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.warnings, "should include warnings when intent differs");
      assert.ok(result.warnings!.some((w: string) => w.includes("intent")), "warning should mention intent");
    }
  });

  it("produces a warning when input sources array differs from candidate sources", () => {
    const input: PlanInput = { query: "x", sources: ["zhida"] };
    const candidate = fallbackPlan({ query: "x" });
    const result = validatePlan(candidate, input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.warnings, "should include warnings when sources differ");
      assert.ok(result.warnings!.some((w: string) => w.includes("source")), "warning should mention source");
    }
  });

  it("produces a warning when deprecated input source differs from candidate sources", () => {
    const input: PlanInput = { query: "x", source: "hot-list" };
    const candidate = fallbackPlan({ query: "x" });
    const result = validatePlan(candidate, input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.warnings, "should include warnings when deprecated source differs");
      assert.ok(result.warnings!.some((w: string) => w.includes("source")), "warning should mention source");
    }
  });
});