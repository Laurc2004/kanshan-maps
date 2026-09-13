import assert from "node:assert/strict";
import test from "node:test";
import { collectKnowledgeSources, shouldOpenCardLink } from "./knowledge-assets.ts";

test("resolves and deduplicates legacy source URLs", () => {
  const sources = collectKnowledgeSources({ question: "Q", consensus: [], viewpoints: [{ stance: "A", summary: "S", evidence: [], authors: [], sources: ["https://zhihu.com/a", "https://zhihu.com/a"] }] }, []);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://zhihu.com/a");
});

test("uses real citation IDs and item metadata for unified graphs", () => {
  const sources = collectKnowledgeSources({ kind: "debate-grid", title: "Q", summary: "", nodes: [], edges: [], groups: [], citations: [{ id: "c1", sourceIndex: 0, url: "https://zhihu.com/a", title: "Citation" }], presentation: { palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } } }, [{ Title: "Answer", ContentType: "answer", ContentID: "1", ContentText: "", Url: "https://zhihu.com/a", VoteUpCount: 1, AuthorName: "Author" }]);
  assert.deepEqual(sources[0], { url: "https://zhihu.com/a", title: "Answer", author: "Author", type: "answer" });
});

test("does not open links during edit or drag", () => {
  assert.equal(shouldOpenCardLink({ link: "https://zhihu.com/a" }), true);
  assert.equal(shouldOpenCardLink({ link: "https://zhihu.com/a", editing: true }), false);
  assert.equal(shouldOpenCardLink({ link: "https://zhihu.com/a", dragged: true }), false);
  assert.equal(shouldOpenCardLink({ link: "javascript:alert(1)" }), false);
});
