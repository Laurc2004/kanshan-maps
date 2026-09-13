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
  assert.equal(graph.presentation.layout, "cluster-board");
});

test("rejects malformed JSON and source-free model output", () => {
  assert.throws(() => parseSummaryJson("not json", "主题", [item(0)]), /有效 JSON/);
  assert.throws(() => parseSummaryJson('{"points":[{"title":"无来源","detail":"内容","sourceIndexes":[9]}]}', "主题", [item(0)]), /真实来源/);
});