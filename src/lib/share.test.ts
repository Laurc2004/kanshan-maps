import test from "node:test";
import assert from "node:assert/strict";
import { isShareCancellation, safeFilename, shareText } from "./share.ts";

test("builds cited share copy and safe filename", () => {
  const graph = { question: "AI/未来?", consensus: [], viewpoints: [{ stance: "是", summary: "", evidence: [], authors: [], sources: ["https://www.zhihu.com/a"] }] };
  assert.match(shareText(graph), /https:\/\/www\.zhihu\.com\/a/);
  assert.equal(safeFilename("AI/未来?"), "AI-未来-.png");
});

test("classifies only AbortError as cancellation", () => {
  const error = new Error("cancel"); error.name = "AbortError";
  assert.equal(isShareCancellation(error), true);
  assert.equal(isShareCancellation(new Error("failed")), false);
});
