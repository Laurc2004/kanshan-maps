import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeGraph, RunPlan, SourceDocument } from "./types.ts";
import type { CollectResult } from "./sources.ts";
import {
  resolveGenerationPath,
  runHarness,
  type HarnessDependencies,
  type HarnessInput,
} from "./executor.ts";

const document: SourceDocument = {
  id: "doc-1",
  title: "Source",
  url: "https://example.com/source",
  text: "grounded facts",
  author: "Author",
  sourceType: "picked",
  score: 1,
  publishedAt: "",
  metadata: {},
};

const graph: KnowledgeGraph = {
  kind: "radial-map",
  title: "Topic",
  summary: "Summary",
  nodes: [{ id: "node-1", label: "Fact", description: "grounded facts", citations: ["doc-1"] }],
  edges: [],
  groups: [],
  citations: [{ id: "doc-1", sourceIndex: 0, url: document.url, title: document.title }],
  presentation: {
    palette: "zhihu-blue",
    density: "comfortable",
    stroke: "clean",
    hierarchy: { title: 1, keyFinding: 1, evidence: 1 },
    layout: "radial-map",
  },
};

function plan(overrides: Partial<RunPlan> = {}): RunPlan {
  return {
    intent: "concept-map",
    queries: ["topic"],
    sources: ["picked"],
    synthesis: { fields: ["concept"], requirements: [] },
    layout: "radial-map",
    style: "zhihu-blue",
    budget: { queryCount: 2, docs: 12, charsPerDoc: 8000, modelCalls: 1, millis: 1000 },
    ...overrides,
  };
}

function input(overrides: Partial<HarnessInput> = {}): HarnessInput {
  return {
    query: "topic",
    picked: [document],
    engine: { id: "builtin" },
    ...overrides,
  };
}

function dependencies(overrides: Partial<HarnessDependencies> = {}): HarnessDependencies {
  return {
    fallbackPlan: () => plan(),
    validatePlan: (candidate) => ({ ok: true, plan: candidate }),
    collectSources: async (): Promise<CollectResult> => ({ documents: [document], errors: [] }),
    synthesize: async () => graph,
    ...overrides,
  };
}

async function eventsFor(runInput = input(), deps = dependencies()) {
  const events = [];
  for await (const event of runHarness(runInput, deps)) events.push(event);
  return events;
}

test("emits the finite harness stages in order", async () => {
  const events = await eventsFor();
  assert.deepEqual(events.map((event) => event.type), [
    "planning", "searching", "sources", "synthesizing", "laying_out", "validating", "graph",
  ]);
  assert.equal((events.at(-1)?.data as { graph: KnowledgeGraph }).graph.title, "Topic");
});

test("preserves partial source errors when usable documents exist", async () => {
  const sourceResult: CollectResult = {
    documents: [document],
    errors: [{ source: "global-search", message: "upstream unavailable" }],
  };
  const events = await eventsFor(input(), dependencies({ collectSources: async () => sourceResult }));
  const sources = events.find((event) => event.type === "sources")?.data as CollectResult;
  assert.deepEqual(sources.errors, sourceResult.errors);
  assert.equal(events.at(-1)?.type, "graph");
});

test("uses collectSources as the parallel adapter seam", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const collectSources: HarnessDependencies["collectSources"] = async ({ sources }) => {
    await Promise.all(sources.map(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
    }));
    return { documents: [document], errors: [] };
  };
  await eventsFor(input(), dependencies({
    fallbackPlan: () => plan({ sources: ["picked", "global-search"] }),
    collectSources,
  }));
  assert.equal(maxInFlight, 2);
});

test("emits a source-level terminal error when no documents remain", async () => {
  const events = await eventsFor(input({ picked: undefined }), dependencies({
    collectSources: async () => ({ documents: [], errors: [{ source: "zhihu-search", message: "quota" }] }),
  }));
  assert.deepEqual(events.map((event) => event.type), ["planning", "searching", "sources", "error"]);
  const error = events.at(-1)?.data as { stage: string; error: string };
  assert.equal(error.stage, "sources");
  assert.match(error.error, /no usable source documents/i);
});

test("attempts at most one supplementary query", async () => {
  let collections = 0;
  let supplements = 0;
  const events = await eventsFor(input({ picked: undefined }), dependencies({
    collectSources: async () => {
      collections += 1;
      return collections === 1
        ? { documents: [], errors: [] }
        : { documents: [document], errors: [] };
    },
    supplementQuery: async () => {
      supplements += 1;
      return "topic evidence";
    },
  }));
  assert.equal(supplements, 1);
  assert.equal(collections, 2);
  assert.equal(events.at(-1)?.type, "graph");
});

test("does not call model dependencies beyond the plan budget", async () => {
  let modelCalls = 0;
  const events = await eventsFor(input(), dependencies({
    fallbackPlan: () => plan({ budget: { ...plan().budget, modelCalls: 0 } }),
    synthesize: async () => {
      modelCalls += 1;
      return graph;
    },
  }));
  assert.equal(modelCalls, 0);
  assert.equal(events.at(-1)?.type, "error");
  assert.match(JSON.stringify(events.at(-1)?.data), /model call budget/i);
});

test("propagates external abort and terminates with an abort error", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const running = eventsFor(input({ signal: controller.signal }), dependencies({
    collectSources: async (_input, _budget, _fetchers, signal) => {
      receivedSignal = signal;
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
      return { documents: [], errors: [] };
    },
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  const events = await running;
  assert.equal(receivedSignal, controller.signal);
  assert.equal(events.at(-1)?.type, "error");
  assert.match(JSON.stringify(events.at(-1)?.data), /abort/i);
});

test("routes only auto mode to the harness and keeps explicit legacy modes compatible", () => {
  assert.equal(resolveGenerationPath("auto"), "harness");
  assert.equal(resolveGenerationPath("viewpoint"), "legacy-viewpoint");
  assert.equal(resolveGenerationPath("roadmap"), "legacy-roadmap");
  assert.equal(resolveGenerationPath(undefined), "legacy-viewpoint");
});
