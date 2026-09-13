import assert from "node:assert/strict";
import test from "node:test";
import { buildSummaryMessages, parseSummaryJson } from "./summary.ts";
import type { SearchResultItem } from "./zhihu.ts";

const item = (index: number, url = `https://www.zhihu.com/p/${index}`): SearchResultItem => ({
  Title: `素材 ${index}`,
  ContentType: "article",
  ContentID: String(index),
  ContentText: `正文 ${index}`,
  Url: url,
  VoteUpCount: 0,
  AuthorName: `作者 ${index}`,
});

test("summary prompt is a single source-grounded model request", () => {
  const messages = buildSummaryMessages("主题", [item(0)]);
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /只能使用输入素材/);
  assert.match(messages[0].content, /不得编造反方观点/);
  assert.match(messages[1].content, /https:\/\/www\.zhihu\.com\/p\/0/);
});

test("parses only points backed by real source URLs", () => {
  const graph = parseSummaryJson(JSON.stringify({
    title: "总结",
    summary: "总述",
    points: [
      { title: "有效", detail: "有来源", sourceIndexes: [1] },
      { title: "伪造", detail: "无来源", sourceIndexes: [99] },
    ],
  }), "主题", [item(0), item(1)]);

  assert.deepEqual(graph.citations.map((citation) => citation.id), ["source-0", "source-1"]);
  assert.equal(graph.nodes.length, 1);
  assert.deepEqual(graph.nodes[0].citations, ["source-1"]);
  assert.equal(graph.presentation.layout, "evidence-tree");
});

test("rejects malformed JSON and source-free model output", () => {
  assert.throws(() => parseSummaryJson("not json", "主题", [item(0)]), /有效 JSON/);
  assert.throws(() => parseSummaryJson('{"points":[{"title":"无来源","detail":"内容","sourceIndexes":[9]}]}', "主题", [item(0)]), /真实来源/);
});
test("summary mindmap layout is balanced two-sided and does not stack into a tall column", async () => {
  const graph = parseSummaryJson(JSON.stringify({
    title: "总结主题",
    summary: "总述",
    points: Array.from({ length: 8 }, (_, i) => ({ title: `要点${i}`, detail: `细节${i}`, sourceIndexes: [0] })),
  }), "主题", [item(0)]);
  const { knowledgeGraphToScene } = await import("./harness/layouts.ts");
  const scene = knowledgeGraphToScene(graph);
  const cards = scene.filter((e) => e.type === "rectangle") as Array<{ x: number; y: number; width: number; height: number }>;
  assert.equal(cards.length, 8);
  const roots = scene.filter((e) => e.type === "ellipse");
  assert.equal(roots.length, 1);
  // 左右分支：x 坐标应分成明显两组（左列与右列），而不是单列堆叠
  const xs = [...new Set(cards.map((c) => c.x))];
  assert.ok(xs.length >= 2, "should occupy at least two columns");
  // 根节点在左右列之间
  const root = roots[0] as { x: number; width: number };
  const leftEdge = Math.min(...cards.map((c) => c.x));
  const rightEdge = Math.max(...cards.map((c) => c.x + c.width));
  assert.ok(root.x > leftEdge && root.x + root.width < rightEdge + 400, "root should sit between the two branches");
});
