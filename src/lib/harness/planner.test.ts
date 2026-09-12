import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fallbackPlan, validatePlan } from "./planner.ts";
import type { LayoutKind, PlanInput, RunPlan } from "./types.ts";

const MAX_QUERIES = 3;
const MAX_DOCS = 12;
const MAX_MODEL_CALLS = 3;

void describe("fallbackPlan rule-based degradation", () => {
  void it("degrades learning class input to roadmap", () => {
    const plan = fallbackPlan({ query: "如何零基础学习价值投资" });
    assert.equal(plan.intent, "learning");
    assert.equal(plan.layout, "roadmap");
  });

  void it("handles an explicit learning intent", () => {
    const plan = fallbackPlan({ query: "随便", intent: "learning" });
    assert.equal(plan.layout, "roadmap");
  });

  void it("degrades time/evolution input to timeline", () => {
    const plan = fallbackPlan({ query: "比特币历年价格演变的完整过程" });
    assert.equal(plan.intent, "time/evolution");
    assert.equal(plan.layout, "timeline");
  });

  void it("degrades controversy/comparison input to compare", () => {
    const plan = fallbackPlan({ query: "A股和港股到底哪个更好，究竟该怎么选" });
    assert.equal(plan.intent, "controversy");
    assert.equal(plan.layout, "compare");
  });

  void it("falls back to concept-map for an ordinary topic", () => {
    const plan = fallbackPlan({ query: "什么是量子计算" });
    assert.equal(plan.intent, "general");
    assert.equal(plan.layout, "concept-map");
  });

  void it("defaults intent to general when an unknown intent is passed", () => {
    const plan = fallbackPlan({ query: "量子计算", intent: "banana" as PlanInput["intent"] });
    assert.equal(plan.intent, "general");
    assert.equal(plan.layout, "concept-map");
  });
});

void describe("fallbackPlan budget clamping", () => {
  void it("clamps queries to at most 3", () => {
    const plan = fallbackPlan({ query: "价值投资", intent: "general", queries: ["a", "b", "c", "d", "e"] });
    assert.ok(plan.queries.length <= MAX_QUERIES, `queries must be <= ${MAX_QUERIES}`);
    assert.ok(plan.queries.length >= 1);
  });

  void it("fills queries with a usable query when empty", () => {
    const plan = fallbackPlan({ query: "价值投资", queries: [] });
    assert.equal(plan.queries.length, 1);
    assert.equal(plan.queries[0], "价值投资");
  });

  void it("clamps budget.docs, budget.modelCalls and budget.millis to hard caps", () => {
    const plan = fallbackPlan({
      query: "x",
      budget: { docs: 99, modelCalls: 50, millis: 9999999 },
    });
    assert.equal(plan.budget.docs, MAX_DOCS);
    assert.equal(plan.budget.modelCalls, MAX_MODEL_CALLS);
    assert.ok(plan.budget.millis <= 120_000, "millis must not exceed the hard cap");
  });
});

void describe("fallbackPlan invalid value fallback", () => {
  void it("falls invalid source back to zhihu", () => {
    const plan = fallbackPlan({ query: "x", source: "garbage" as PlanInput["source"] });
    assert.equal(plan.source, "zhihu");
  });

  void it("falls invalid layout back to concept-map", () => {
    const plan = fallbackPlan({ query: "x", layout: "garbage" as PlanInput["layout"] });
    assert.equal(plan.layout, "concept-map");
  });

  void it("falls invalid style back to default", () => {
    const plan = fallbackPlan({ query: "x", style: "garbage" as PlanInput["style"] });
    assert.equal(plan.style, "default");
  });

  void it("preserves valid provided values", () => {
    const plan = fallbackPlan({ query: "x", source: "web", layout: "timeline", style: "bold" });
    assert.equal(plan.source, "web");
    assert.equal(plan.layout, "timeline");
    assert.equal(plan.style, "bold");
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

  it("rejects a candidate that exceeds budget caps", () => {
    const input: PlanInput = { query: "量子计算" };
    const bad: RunPlan = { ...fallbackPlan(input), budget: { docs: 99, modelCalls: 99, millis: 999999 } };
    const result = validatePlan(bad, input);
    assert.equal(result.ok, false);
  });

  it("rejects a candidate whose layout is not allowed", () => {
    const input: PlanInput = { query: "x" };
    const bad: RunPlan = { ...fallbackPlan(input), layout: "banana" as LayoutKind };
    const result = validatePlan(bad, input);
    assert.equal(result.ok, false);
  });
});