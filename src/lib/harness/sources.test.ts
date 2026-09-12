/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { SourceDocument, SourceId } from "./types.ts";
import type { SearchResultItem } from "../zhihu.ts";

// ─── Fake data ────────────────────────────────────────────────────
const FAKE_PICKED: SourceDocument = {
  id: "picked-1",
  title: "User picked article",
  url: "https://example.com/picked-1",
  text: "This is a user-picked article with substantive content for testing purposes.",
  author: "Author A",
  sourceType: "picked",
  score: 1,
  publishedAt: "2026-01-01",
  metadata: {},
};

const FAKE_ZHIHU_ITEMS: SearchResultItem[] = [
  {
    Title: "Zhihu Search Result 1",
    ContentType: "Answer",
    ContentID: "zhihu-1",
    ContentText: "This is zhihu search result one with enough text to be useful.",
    Url: "https://www.zhihu.com/answer/zhihu-1",
    VoteUpCount: 100,
    AuthorName: "Author Zhihu",
    AuthorAvatar: "https://example.com/avatar.png",
    AuthorityLevel: "2",
  },
  {
    Title: "Zhihu Search Result 2",
    ContentType: "Article",
    ContentID: "zhihu-2",
    ContentText: "Second zhihu result with some content for testing.",
    Url: "https://zhuanlan.zhihu.com/p/zhihu-2",
    VoteUpCount: 50,
    AuthorName: "Author Two",
    AuthorityLevel: "1",
  },
];

const FAKE_GLOBAL_ITEMS: SearchResultItem[] = [
  {
    Title: "Global Search Result",
    ContentType: "Answer",
    ContentID: "global-1",
    ContentText: "This is a global web search result with relevant information.",
    Url: "https://example.com/global-1",
    VoteUpCount: 200,
    AuthorName: "Web Author",
    AuthorityLevel: "3",
  },
];

const FAKE_KNOWLEDGE_LIST = [
  { work_id: "k1", title: "Knowledge Item 1", description: "A knowledge item", labels: ["tech"] },
  { work_id: "k2", title: "Knowledge Item 2", description: "Another item", labels: ["science"] },
];

const FAKE_KNOWLEDGE_DETAIL = {
  work_id: "k2",
  chapter_name: "Knowledge Item 2",
  author_name: "Knowledge Author",
  introduction: "A detailed knowledge item introduction.",
  content: "This is the full content of knowledge item 2 with substantial text for normalization testing and deduplication verification. It contains enough characters to pass the minimum threshold and be included as a valid source document after normalization.",
};

// ─── Tests ─────────────────────────────────────────────────────────

void describe("picked adapter (no network)", () => {
  void it("returns picked documents without calling any fetcher", async () => {
    const { collectSources } = await import("./sources.ts");
    const fetcherSpy = mock.fn(() => Promise.reject(new Error("should not be called")));

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["picked"], picked: [FAKE_PICKED] },
      { budget: { docs: 12, charsPerDoc: 8000 } } as any,
      fetcherSpy as any,
    );

    assert.equal(fetcherSpy.mock.callCount(), 0, "picked adapter must not call any fetcher");
    assert.ok(docs.length >= 1, "should return picked documents");
    assert.equal(docs[0].id, "picked-1");
  });
});

void describe("zhihu-search adapter", () => {
  void it("skips malformed entries, records item errors, and preserves valid siblings", async () => {
    const { collectSources } = await import("./sources.ts");
    const malformed = [
      { ...FAKE_ZHIHU_ITEMS[0], ContentID: "" },
      { ...FAKE_ZHIHU_ITEMS[0], Url: undefined },
      { ...FAKE_ZHIHU_ITEMS[0], ContentText: 42 },
    ] as unknown as SearchResultItem[];

    const result = await collectSources(
      { query: "test", sources: ["zhihu-search"] },
      undefined,
      { zhihuSearch: async () => [...malformed, FAKE_ZHIHU_ITEMS[1]] },
    );

    assert.deepEqual(result.documents.map((doc) => doc.id), ["zhihu-search:zhihu-2"]);
    assert.equal(result.errors.length, 3);
    assert.ok(result.errors.every((error) => error.source === "zhihu-search"));
    assert.ok(result.errors.every((error) => error.message.includes("Malformed search item")));
  });

  void it("caps count at 10 (API limit)", async () => {
    const { collectSources } = await import("./sources.ts");

    let requestedCount = 0;
    const zhihuFetcher = mock.fn(async (_query: string, count: number) => {
      requestedCount = count;
      return FAKE_ZHIHU_ITEMS.slice(0, Math.min(count, FAKE_ZHIHU_ITEMS.length));
    });

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["zhihu-search"] },
      { budget: { docs: 12, charsPerDoc: 8000 } } as any,
      { zhihuSearch: zhihuFetcher } as any,
    );

    assert.ok(requestedCount <= 10, `count ${requestedCount} must not exceed 10`);
  });

  void it("normalizes zhihu-search items to SourceDocument", async () => {
    const { collectSources } = await import("./sources.ts");

    const zhihuFetcher = mock.fn(async () => FAKE_ZHIHU_ITEMS);

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["zhihu-search"] },
      { budget: { docs: 12, charsPerDoc: 8000 } } as any,
      { zhihuSearch: zhihuFetcher } as any,
    );

    assert.equal(docs.length, FAKE_ZHIHU_ITEMS.length);
    assert.ok(docs[0].id, "should have an id");
    assert.ok(docs[0].url.includes("zhihu.com"), "should preserve zhihu url");
    assert.equal(docs[0].sourceType, "zhihu-search");
    assert.equal(docs[0].author, "Author Zhihu");
  });
});

void describe("global-search adapter", () => {
  void it("caps count at 20 (API limit)", async () => {
    const { collectSources } = await import("./sources.ts");

    let requestedCount = 0;
    const globalFetcher = mock.fn(async (_query: string, count: number, _filter?: string, _searchDB?: string) => {
      requestedCount = count;
      return FAKE_GLOBAL_ITEMS.slice(0, Math.min(count, FAKE_GLOBAL_ITEMS.length));
    });

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["global-search"] },
      { budget: { docs: 12, charsPerDoc: 8000 } } as any,
      { globalSearch: globalFetcher } as any,
    );

    assert.ok(requestedCount <= 20, `count ${requestedCount} must not exceed 20`);
  });
});

void describe("zhihu-knowledge adapter", () => {
  void it("records invalid ids and detail failures while retaining usable list data", async () => {
    const { collectSources } = await import("./sources.ts");
    const detailFetcher = mock.fn(async () => { throw new Error("detail unavailable"); });

    const result = await collectSources(
      { query: "test", sources: ["zhihu-knowledge"] },
      undefined,
      {
        zhihuKnowledgeList: async () => [
          { work_id: "bad/id", title: "Bad", description: "must be skipped" },
          { work_id: "usable", title: "Usable", description: "List description remains usable." },
        ],
        zhihuKnowledgeDetail: detailFetcher,
      },
    );

    assert.equal(detailFetcher.mock.callCount(), 1);
    assert.deepEqual(result.documents.map((doc) => doc.id), ["zhihu-knowledge:usable"]);
    assert.equal(result.documents[0].text, "List description remains usable.");
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.some((error) => error.message.includes("Invalid work_id")));
    assert.ok(result.errors.some((error) => error.message.includes("detail unavailable")));
  });

  void it("normalizes knowledge items to SourceDocument", async () => {
    const { collectSources } = await import("./sources.ts");

    const knowledgeListFetcher = mock.fn(async () => FAKE_KNOWLEDGE_LIST);
    const knowledgeDetailFetcher = mock.fn(async (_id: string) => FAKE_KNOWLEDGE_DETAIL);

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["zhihu-knowledge"] },
      { budget: { docs: 4, charsPerDoc: 8000 } } as any,
      { zhihuKnowledgeList: knowledgeListFetcher, zhihuKnowledgeDetail: knowledgeDetailFetcher } as any,
    );

    assert.ok(docs.length > 0, "should return knowledge documents");
    // Should include normalized knowledge detail
    const hasDetail = docs.some(d => d.title === "Knowledge Item 2");
    assert.ok(hasDetail, "should normalize knowledge detail to SourceDocument");
    assert.equal(docs[0].sourceType, "zhihu-knowledge");
  });
});

void describe("deduplication", () => {
  void it("deduplicates shared provider content ids across search sources", async () => {
    const { collectSources } = await import("./sources.ts");
    const shared = { ...FAKE_ZHIHU_ITEMS[0], ContentID: "shared-provider-id" };

    const result = await collectSources(
      { query: "test", sources: ["zhihu-search", "global-search"] },
      undefined,
      {
        zhihuSearch: async () => [{ ...shared, Url: "https://www.zhihu.com/answer/one" }],
        globalSearch: async () => [{ ...shared, Url: "https://example.com/copy" }],
      },
    );

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].sourceType, "zhihu-search");
    assert.equal(result.documents[0].metadata.contentId, "shared-provider-id");
  });

  void it("does not deduplicate unrelated documents without provider content ids", async () => {
    const { deduplicateDocuments } = await import("./sources.ts");
    const docs: SourceDocument[] = [
      { ...FAKE_PICKED, id: "picked-a", url: "https://example.com/a" },
      { ...FAKE_PICKED, id: "picked-b", url: "https://example.com/b" },
    ];

    assert.equal(deduplicateDocuments(docs).length, 2);
  });

  void it("deduplicates documents with same URL", async () => {
    const { deduplicateDocuments } = await import("./sources.ts");

    const docs: SourceDocument[] = [
      { id: "a", title: "A", url: "https://example.com/dup", text: "text", author: "", sourceType: "zhihu-search", score: 1, publishedAt: "", metadata: {} },
      { id: "b", title: "B", url: "https://example.com/dup", text: "text2", author: "", sourceType: "global-search", score: 1, publishedAt: "", metadata: {} },
      { id: "c", title: "C", url: "https://example.com/unique", text: "text3", author: "", sourceType: "picked", score: 1, publishedAt: "", metadata: {} },
    ];

    const deduped = deduplicateDocuments(docs);
    assert.equal(deduped.length, 2, "should dedupe by URL, keeping 2 unique URLs");
    // Should keep the first occurrence
    const uniqueUrls = deduped.map(d => d.url);
    assert.ok(uniqueUrls.includes("https://example.com/dup"));
    assert.ok(uniqueUrls.includes("https://example.com/unique"));
  });

  void it("deduplicates documents with same id", async () => {
    const { deduplicateDocuments } = await import("./sources.ts");

    const docs: SourceDocument[] = [
      { id: "same-id", title: "First", url: "https://example.com/first", text: "text", author: "", sourceType: "picked", score: 1, publishedAt: "", metadata: {} },
      { id: "same-id", title: "Second", url: "https://example.com/second", text: "text2", author: "", sourceType: "zhihu-search", score: 1, publishedAt: "", metadata: {} },
    ];

    const deduped = deduplicateDocuments(docs);
    assert.equal(deduped.length, 1, "should dedupe by id, keeping first");
    assert.equal(deduped[0].title, "First");
  });
});

void describe("partial adapter failure isolation", () => {
  void it("propagates an external abort to in-flight fetchers and returns promptly", async () => {
    const { collectSources } = await import("./sources.ts");
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const neverSettles = new Promise<SearchResultItem[]>(() => {});

    const collecting = collectSources(
      { query: "test", sources: ["zhihu-search"] },
      undefined,
      {
        zhihuSearch: async (_query, _count, signal) => {
          receivedSignal = signal;
          return neverSettles;
        },
      },
      controller.signal,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const result = await Promise.race([
      collecting,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("abort did not return promptly")), 100)),
    ]);

    assert.equal(receivedSignal?.aborted, true);
    assert.equal(result.documents.length, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /abort/i);
  });

  void it("continues when one adapter fails and preserves other results", async () => {
    const { collectSources } = await import("./sources.ts");

    const failingFetcher = mock.fn(async () => { throw new Error("Network error"); });
    const workingFetcher = mock.fn(async () => FAKE_ZHIHU_ITEMS);

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["zhihu-knowledge", "zhihu-search"] },
      { budget: { docs: 12, charsPerDoc: 8000 } } as any,
      { zhihuSearch: workingFetcher, zhihuKnowledgeList: failingFetcher, zhihuKnowledgeDetail: failingFetcher } as any,
    );

    // zhihu-knowledge failed but zhihu-search should still produce results
    assert.ok(docs.length > 0, "should still return results from working adapters");
    assert.ok(docs.some(d => d.sourceType === "zhihu-search"), "should include zhihu-search results");
  });
});

void describe("text clipping and empty filtering", () => {
  void it("clips document text to charsPerDoc budget", async () => {
    const { collectSources } = await import("./sources.ts");

    const longText = "A".repeat(200);
    const pickedDoc: SourceDocument = {
      id: "long", title: "Long Doc", url: "https://example.com/long",
      text: longText, author: "", sourceType: "picked" as SourceId,
      score: 1, publishedAt: "", metadata: {},
    };

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["picked"], picked: [pickedDoc] },
      { budget: { docs: 12, charsPerDoc: 50 } } as any,
      {} as any,
    );

    assert.ok(docs.length === 1, "should keep document with long text");
    assert.ok(docs[0].text.length <= 50, `text length ${docs[0].text.length} should not exceed charsPerDoc budget`);
  });

  void it("filters out documents with empty text after normalization", async () => {
    const { collectSources, normalizeDocument } = await import("./sources.ts");

    // normalizeDocument must produce a document with empty text
    const normalized = normalizeDocument({ ...FAKE_ZHIHU_ITEMS[0], ContentText: "" }, "zhihu-search");
    assert.equal(normalized.text, "", "normalizeDocument should carry through empty content text");

    // Empty text item from zhihu
    const emptyTextItem = { ...FAKE_ZHIHU_ITEMS[0], ContentText: "" };
    const zhihuFetcher = mock.fn(async () => [emptyTextItem]);

    const { documents: docs } = await collectSources(
      { query: "test", sources: ["zhihu-search"] },
      { budget: { docs: 12, charsPerDoc: 8000 } } as any,
      { zhihuSearch: zhihuFetcher } as any,
    );

    assert.equal(docs.length, 0, "should filter out empty-text documents");
  });
});

void describe("knowledge URL safety", () => {
  void it("uses the documented API host and path encoding", async () => {
    const { normalizeKnowledgeItem } = await import("./sources.ts");
    const document = normalizeKnowledgeItem({ work_id: "work id", title: "Title" });

    assert.equal(document.url, "https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/work%20id");
  });
});
