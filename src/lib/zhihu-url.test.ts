import assert from "node:assert/strict";
import test from "node:test";
import { isZhihuUrl, parseZhihuArticleHtml } from "./zhihu.ts";

test("isZhihuUrl recognizes zhihu question/answer/article links only", () => {
  assert.equal(isZhihuUrl("https://www.zhihu.com/question/123456789/answer/987654321"), true);
  assert.equal(isZhihuUrl("https://www.zhihu.com/question/123456789"), true);
  assert.equal(isZhihuUrl("https://zhuanlan.zhihu.com/p/1234567890123456"), true);
  assert.equal(isZhihuUrl("https://www.zhihu.com/answer/987654321"), true);
  assert.equal(isZhihuUrl("  https://www.zhihu.com/question/123  "), true);
  assert.equal(isZhihuUrl("https://www.zhihu.com/people/someone"), false);
  assert.equal(isZhihuUrl("https://example.com/question/1"), false);
  assert.equal(isZhihuUrl("考研还是就业"), false);
  assert.equal(isZhihuUrl("https://zhuanlan.zhihu.com/p/abc"), false);
});

test("parseZhihuArticleHtml extracts zhuanlan article into a source item", () => {
  const initialData = {
    initialState: {
      entities: {
        articles: {
          "123": { id: "123", title: "深度好文", content: "<p>第一段&nbsp;内容</p><p>第二段</p>", voteupCount: 42, author: { name: "看山" } },
        },
      },
    },
  };
  const html = `<html><body><script id="js-initialData" type="text/json">${JSON.stringify(initialData)}</script></body></html>`;
  const item = parseZhihuArticleHtml(html, "https://zhuanlan.zhihu.com/p/123");
  assert.ok(item);
  assert.equal(item.Title, "深度好文");
  assert.equal(item.ContentType, "article");
  assert.equal(item.AuthorName, "看山");
  assert.equal(item.VoteUpCount, 42);
  assert.ok(item.ContentText.includes("第一段 内容"));
  assert.equal(item.Url, "https://zhuanlan.zhihu.com/p/123");
});

test("parseZhihuArticleHtml extracts answer with its question title", () => {
  const initialData = {
    initialState: {
      entities: {
        answers: {
          "555": { id: "555", content: "<p>回答正文</p>", voteupCount: 7, author: { name: "答主" }, question: { id: "999" } },
        },
        questions: { "999": { title: "怎么看这件事？" } },
      },
    },
  };
  const html = `<html><body><script id="js-initialData" type="text/json">${JSON.stringify(initialData)}</script></body></html>`;
  const item = parseZhihuArticleHtml(html, "https://www.zhihu.com/question/999/answer/555");
  assert.ok(item);
  assert.equal(item.Title, "怎么看这件事？");
  assert.equal(item.ContentType, "answer");
  assert.ok(item.ContentText.includes("回答正文"));
});

test("parseZhihuArticleHtml returns null on missing or malformed initialData", () => {
  assert.equal(parseZhihuArticleHtml("<html>no data</html>", "https://zhuanlan.zhihu.com/p/1"), null);
  assert.equal(parseZhihuArticleHtml('<script id="js-initialData" type="text/json">not json</script>', "https://zhuanlan.zhihu.com/p/1"), null);
  assert.equal(parseZhihuArticleHtml('<script id="js-initialData" type="text/json">{}</script>', "https://zhuanlan.zhihu.com/p/1"), null);
});
