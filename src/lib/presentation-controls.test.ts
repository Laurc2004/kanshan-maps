import test from "node:test";
import assert from "node:assert/strict";
import type { KnowledgeGraph, PaletteId } from "./harness/types.ts";
import { PALETTES, applyPalette } from "./presentation-controls.ts";

const graph = (): KnowledgeGraph => ({
  kind: "debate-grid",
  title: "T",
  summary: "",
  nodes: [],
  edges: [],
  groups: [],
  citations: [],
  presentation: { layout: "debate-grid", palette: "zhihu-blue" as PaletteId, density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } },
});

test("palette conversion keeps the graph's own layout", () => {
  const next = applyPalette(graph(), "paper-pastel");
  assert.equal(next.presentation.palette, "paper-pastel");
  assert.equal(next.presentation.layout, "debate-grid");
  assert.equal(next.kind, "debate-grid");
});

test("palette conversion is deterministic", () => {
  assert.deepEqual(applyPalette(graph(), "poster-bold"), applyPalette(graph(), "poster-bold"));
});

test("palettes cover all five ids uniquely", () => {
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, 5);
});
