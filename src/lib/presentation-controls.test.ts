import test from "node:test";
import assert from "node:assert/strict";
import { allowedLayouts, applyPresentation } from "./presentation-controls.ts";

test("offers mode-safe layouts", () => {
  assert.deepEqual(allowedLayouts({ question: "Q", consensus: [], viewpoints: [] }), ["debate-grid", "cluster-board", "radial-map"]);
  assert.deepEqual(allowedLayouts({ kind: "roadmap", topic: "T", stages: [] }), ["swimlane-roadmap", "timeline"]);
});

test("presentation conversion is deterministic", () => {
  const input = { question: "Q", consensus: [], viewpoints: [] };
  assert.deepEqual(applyPresentation(input, "cluster-board", "paper-pastel"), applyPresentation(input, "cluster-board", "paper-pastel"));
});
