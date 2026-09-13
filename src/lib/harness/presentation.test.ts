import test from "node:test";
import assert from "node:assert/strict";
import { knowledgeGraphToScene } from "./layouts.ts";
import { resolvePresentation } from "./presentation.ts";
import type { KnowledgeGraph, RunPlan } from "./types.ts";

const graph = (): KnowledgeGraph => ({ kind: "cluster-board", title: "A title", summary: "A useful summary", nodes: [{ id: "a", label: "Finding", description: "Evidence text", citations: [], emphasis: "high" }, { id: "b", label: "Detail", description: "More evidence", citations: [] }], edges: [{ fromId: "a", toId: "b" }], groups: [], citations: [], presentation: { layout: "cluster-board", palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } } });
const plan = (presentation: RunPlan["presentation"]): RunPlan => ({ intent: "compare", queries: ["q"], sources: ["picked"], synthesis: { fields: [], requirements: [] }, layout: "cluster-board", style: presentation?.palette ?? "zhihu-blue", budget: { queryCount: 1, docs: 2, charsPerDoc: 100, modelCalls: 1, millis: 1000 }, presentation });

test("resolvePresentation applies the complete presentation contract", () => {
  const result = resolvePresentation(plan({ palette: "poster-bold", density: "spacious", stroke: "marker", hierarchy: { title: 1.4, keyFinding: 1.2, evidence: 0.8 }, layout: "evidence-tree" }), graph());
  assert.deepEqual(result, { palette: "poster-bold", density: "spacious", stroke: "marker", hierarchy: { title: 1.4, keyFinding: 1.2, evidence: 0.8 }, layout: "evidence-tree" });
});

test("palette, density, stroke, and hierarchy each change observable scene output", () => {
  const base = graph();
  const variants = [
    { ...base, presentation: { ...base.presentation, palette: "paper-pastel" as const } },
    { ...base, presentation: { ...base.presentation, density: "spacious" as const } },
    { ...base, presentation: { ...base.presentation, stroke: "sketch" as const } },
    { ...base, presentation: { ...base.presentation, hierarchy: { title: 1.6, keyFinding: 1.3, evidence: 0.7 } } },
  ].map((value) => JSON.stringify(knowledgeGraphToScene(value)));
  const original = JSON.stringify(knowledgeGraphToScene(base));
  assert.ok(variants.every((value) => value !== original));
});

test("presentation output is deterministic", () => {
  const value = plan({ palette: "nature-notes", density: "compact", stroke: "sketch", hierarchy: { title: 0.9, keyFinding: 1, evidence: 1.1 } });
  assert.deepEqual(resolvePresentation(value, graph()), resolvePresentation(value, graph()));
});
