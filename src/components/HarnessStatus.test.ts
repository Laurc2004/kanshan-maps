import assert from "node:assert/strict";
import test from "node:test";
import { harnessStageLabel, sourceLabel } from "./HarnessStatus.helpers.ts";

test("maps every harness event to a concise Chinese stage", () => {
  assert.deepEqual(
    ["planning", "searching", "sources", "synthesizing", "laying_out", "validating", "graph", "error"].map((stage) => harnessStageLabel(stage as Parameters<typeof harnessStageLabel>[0])),
    ["规划", "检索", "整理素材", "综合", "布局", "验证", "完成", "出错"],
  );
});

test("labels mixed source documents", () => {
  assert.deepEqual(
    ["zhihu-search", "global-search", "zhihu-knowledge", "picked", "hot-list", "zhida"].map(sourceLabel),
    ["知乎回答", "全网搜索", "知乎知识", "自选资料", "热榜", "直答"],
  );
});
