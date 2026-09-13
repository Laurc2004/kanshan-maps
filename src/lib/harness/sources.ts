// Harness 多源适配器：把自选资料、知乎搜索、全网搜索、知乎知识统一成 SourceDocument
// 所有 adapter 接受注入的 fetcher 便于测试；每个 adapter 有独立超时与错误隔离

import type { SourceDocument, SourceId, HarnessBudget } from "./types.ts";
import type { SearchResultItem, KnowledgeListItem, KnowledgeDetail } from "../zhihu.ts";

// ─── 注入 fetcher 类型 ─────────────────────────────────────────────

export type ZhihuSearchFetcher = (query: string, count: number, signal?: AbortSignal) => Promise<SearchResultItem[]>;
export type GlobalSearchFetcher = (
  query: string,
  count: number,
  filter?: string,
  searchDB?: string,
  signal?: AbortSignal,
) => Promise<SearchResultItem[]>;
export type KnowledgeListFetcher = (signal?: AbortSignal) => Promise<KnowledgeListItem[]>;
export type KnowledgeDetailFetcher = (workId: string, signal?: AbortSignal) => Promise<KnowledgeDetail>;

export interface Fetchers {
  zhihuSearch?: ZhihuSearchFetcher;
  globalSearch?: GlobalSearchFetcher;
  zhihuKnowledgeList?: KnowledgeListFetcher;
  zhihuKnowledgeDetail?: KnowledgeDetailFetcher;
}

// ─── SourceAdapter 契约 ────────────────────────────────────────────

export interface AdapterContext {
  query: string;
  queries?: string[];
  picked?: SourceDocument[];
  budget: HarnessBudget;
}

export interface AdapterResult {
  documents: SourceDocument[];
  errors: Array<{ source: SourceId; message: string }>;
}

export interface SourceAdapter {
  readonly source: SourceId;
  run(ctx: AdapterContext, fetchers: Fetchers, signal?: AbortSignal): Promise<AdapterResult>;
}

// ─── 超时工具 ──────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  signal: AbortSignal,
  parentSignal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error(parentSignal?.aborted ? `${label} aborted` : `${label} timed out after ${ms}ms`));
    };
    const timer = setTimeout(onAbort, ms);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    promise.then(
      (v) => { cleanup(); resolve(v); },
      (e) => { cleanup(); reject(e); },
    );
  });
}

const BUDGET_MAX: HarnessBudget = { queryCount: 3, docs: 8, charsPerDoc: 2600, modelCalls: 3, millis: 60_000 };
function normalizeBudget(input: Partial<HarnessBudget>): HarnessBudget {
  const value = (key: keyof HarnessBudget): number => {
    const raw = input[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return BUDGET_MAX[key];
    return Math.max(1, Math.min(BUDGET_MAX[key], Math.floor(raw)));
  };
  return {
    queryCount: value("queryCount"), docs: value("docs"), charsPerDoc: value("charsPerDoc"),
    modelCalls: value("modelCalls"), millis: value("millis"),
  };
}

function validWorkId(workId: unknown): workId is string {
  return typeof workId === "string" && workId.length > 0 && !/[/?#\n\r]/.test(workId);
}

// ─── 文档规范化 ────────────────────────────────────────────────────

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * 统一规范化入口：根据来源类型分派到对应规范化函数。
 */
export function normalizeDocument(
  raw: Record<string, unknown>,
  sourceType: SourceId,
  extra?: { detail?: KnowledgeDetail },
): SourceDocument {
  switch (sourceType) {
    case "zhihu-knowledge":
      return normalizeKnowledgeItem(raw as unknown as KnowledgeListItem, extra?.detail);
    case "global-search":
    case "zhihu-search":
    case "hot-list":
      return normalizeSearchItem(raw as unknown as SearchResultItem, sourceType);
    default:
      throw new Error(`Cannot normalize unknown source type: ${sourceType}`);
  }
}

/**
 * 知乎搜索结果 → SourceDocument
 */
export function normalizeSearchItem(item: SearchResultItem, sourceType: SourceId): SourceDocument {
  return {
    id: `${sourceType}:${item.ContentID}`,
    title: item.Title || "（无标题）",
    url: item.Url,
    text: stripHtml(item.ContentText),
    author: item.AuthorName || "",
    sourceType,
    score: item.VoteUpCount ?? 0,
    publishedAt: item.EditTime ? new Date(item.EditTime * 1000).toISOString() : "",
    metadata: {
      contentType: item.ContentType,
      contentId: item.ContentID,
      authorityLevel: item.AuthorityLevel,
      commentCount: item.CommentCount,
    },
  };
}

/**
 * 知乎知识列表 + 详情 → SourceDocument
 */
export function normalizeKnowledgeItem(
  item: KnowledgeListItem,
  detail?: KnowledgeDetail,
): SourceDocument {
  if (!validWorkId(item.work_id)) throw new Error("Invalid work_id");
  const title = detail?.chapter_name || item.title;
  const text = [detail?.introduction, detail?.content].filter(Boolean).join("\n") || item.description || "";
  return {
    id: `zhihu-knowledge:${item.work_id}`,
    title: title || "（无标题）",
    url: `https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/${encodeURIComponent(item.work_id)}`,
    text: clampText(text, 8000),
    author: detail?.author_name || "",
    sourceType: "zhihu-knowledge",
    score: 0,
    publishedAt: "",
    metadata: {
      workId: item.work_id,
      description: item.description,
      labels: item.labels,
    },
  };
}

// ─── 去重 ──────────────────────────────────────────────────────────

/**
 * 按 URL、provider ContentID、最后内部 id 去重，保留第一次出现的文档。
 */
export function deduplicateDocuments(docs: SourceDocument[]): SourceDocument[] {
  const seenUrl = new Set<string>();
  const seenId = new Set<string>();
  const seenContentId = new Set<string>();
  const out: SourceDocument[] = [];
  for (const doc of docs) {
    const idKey = doc.id;
    const contentId = doc.metadata.contentId;
    if ((doc.url && seenUrl.has(doc.url)) ||
      (typeof contentId === "string" && contentId.length > 0 && seenContentId.has(contentId)) ||
      seenId.has(idKey)) continue;
    if (doc.url) seenUrl.add(doc.url);
    seenId.add(idKey);
    if (typeof contentId === "string" && contentId.length > 0) seenContentId.add(contentId);
    out.push(doc);
  }
  return out;
}

// ─── 内置 Adapter 实现 ─────────────────────────────────────────────

const PICKED_ADAPTER: SourceAdapter = {
  source: "picked",
  async run(ctx) {
    const picked = ctx.picked ?? [];
    const docs = picked.map((d) => ({
      ...d,
      text: clampText(d.text, ctx.budget.charsPerDoc),
    }));
    return { documents: docs, errors: [] };
  },
};

class NetworkAdapter implements SourceAdapter {
  readonly source: SourceId;
  private readonly timeoutMs: number;
  private readonly runImpl: (
    ctx: AdapterContext,
    fetchers: Fetchers,
    signal?: AbortSignal,
  ) => Promise<{ documents: SourceDocument[]; errors?: Array<{ source: SourceId; message: string }> }>;

  constructor(
    source: SourceId,
    timeoutMs: number,
    runImpl: (
      ctx: AdapterContext,
      fetchers: Fetchers,
      signal?: AbortSignal,
    ) => Promise<{ documents: SourceDocument[]; errors?: Array<{ source: SourceId; message: string }> }>,
  ) {
    this.source = source;
    this.timeoutMs = timeoutMs;
    this.runImpl = runImpl;
  }

  async run(ctx: AdapterContext, fetchers: Fetchers, parentSignal?: AbortSignal): Promise<AdapterResult> {
    const controller = new AbortController();
    const abortParent = () => controller.abort();
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener("abort", abortParent, { once: true });
    const timeoutMs = Math.min(this.timeoutMs, Math.max(1, ctx.budget.millis));
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await withTimeout(
        this.runImpl(ctx, fetchers, controller.signal),
        timeoutMs,
        this.source,
        controller.signal,
        parentSignal,
      );
      return { documents: result.documents, errors: result.errors ?? [] };
    } catch (e) {
      return { documents: [], errors: [{ source: this.source, message: e instanceof Error ? e.message : String(e) }] };
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortParent);
    }
  }
}

function zhihuSearchAdapter(timeoutMs: number): SourceAdapter {
  return new NetworkAdapter("zhihu-search", timeoutMs, async (ctx, fetchers, signal) => {
    const fetcher = fetchers.zhihuSearch ?? realZhihuSearch;
    const results: SourceDocument[] = [];
    const errors: Array<{ source: SourceId; message: string }> = [];
    const queries = ctx.queries && ctx.queries.length > 0 ? ctx.queries : [ctx.query];
    for (const q of queries.slice(0, ctx.budget.queryCount)) {
      const items = await fetcher(q, 10, signal); // Count 上限 10
      for (const item of items) {
        try {
          if (typeof item.ContentID !== "string" || item.ContentID.length === 0 ||
            typeof item.Url !== "string" || item.Url.length === 0 ||
            typeof item.ContentText !== "string") throw new Error("Malformed search item: ContentID, Url, and ContentText are required strings");
          results.push(normalizeSearchItem(item, "zhihu-search"));
        } catch (e) { errors.push({ source: "zhihu-search", message: e instanceof Error ? e.message : String(e) }); }
      }
    }
    return { documents: results, errors };
  });
}

function globalSearchAdapter(timeoutMs: number): SourceAdapter {
  return new NetworkAdapter("global-search", timeoutMs, async (ctx, fetchers, signal) => {
    const fetcher = fetchers.globalSearch ?? realGlobalSearch;
    const q = (ctx.queries && ctx.queries.length > 0 ? ctx.queries : [ctx.query])[0];
    const items = await fetcher(q, 20, undefined, undefined, signal); // Count 官方上限 20
    const errors: Array<{ source: SourceId; message: string }> = [];
    const documents = items.flatMap((it) => {
      try {
        if (typeof it.ContentID !== "string" || it.ContentID.length === 0 ||
          typeof it.Url !== "string" || it.Url.length === 0 ||
          typeof it.ContentText !== "string") throw new Error("Malformed search item: ContentID, Url, and ContentText are required strings");
        return [normalizeSearchItem(it, "global-search")];
      } catch (e) { errors.push({ source: "global-search", message: e instanceof Error ? e.message : String(e) }); return []; }
    });
    return { documents, errors };
  });
}

function zhihuKnowledgeAdapter(timeoutMs: number): SourceAdapter {
  return new NetworkAdapter("zhihu-knowledge", timeoutMs, async (ctx, fetchers, signal) => {
    const listFetcher = fetchers.zhihuKnowledgeList ?? realZhihuKnowledgeList;
    const detailFetcher = fetchers.zhihuKnowledgeDetail ?? realZhihuKnowledgeDetail;
    const list = await listFetcher(signal);
    const docs: SourceDocument[] = [];
    const errors: Array<{ source: SourceId; message: string }> = [];
    for (const item of list.slice(0, ctx.budget.docs)) {
      if (!validWorkId(item.work_id)) {
        errors.push({ source: "zhihu-knowledge", message: "Invalid work_id" });
        continue;
      }
      let detail: KnowledgeDetail | undefined;
      try {
        detail = await detailFetcher(item.work_id, signal);
      } catch (e) {
        errors.push({ source: "zhihu-knowledge", message: e instanceof Error ? e.message : String(e) });
      }
      try { docs.push(normalizeKnowledgeItem(item, detail)); } catch (e) {
        errors.push({ source: "zhihu-knowledge", message: e instanceof Error ? e.message : String(e) });
      }
    }
    return { documents: docs, errors };
  });
}

// ─── 真实 fetcher（默认注入，未提供 fetchers 时使用） ─────────────

import { zhihuSearch, globalSearch, zhihuKnowledgeList, zhihuKnowledgeDetail } from "../zhihu.ts";

const realZhihuSearch: ZhihuSearchFetcher = async (query, count, signal) => {
  const items = await zhihuSearch(query, count, signal);
  return items;
};
const realGlobalSearch: GlobalSearchFetcher = async (query, count, filter, searchDB, signal) => {
  return globalSearch(query, count, filter, searchDB, signal);
};
const realZhihuKnowledgeList: KnowledgeListFetcher = async (signal) => zhihuKnowledgeList(signal);
const realZhihuKnowledgeDetail: KnowledgeDetailFetcher = async (id, signal) => zhihuKnowledgeDetail(id, signal);

// ─── Adapter 注册表 ────────────────────────────────────────────────

export const DEFAULT_ADAPTER_TIMEOUT_MS = 10_000;

const adapterRegistry: Record<SourceId, () => SourceAdapter> = {
  picked: () => PICKED_ADAPTER,
  "zhihu-search": () => zhihuSearchAdapter(DEFAULT_ADAPTER_TIMEOUT_MS),
  "global-search": () => globalSearchAdapter(DEFAULT_ADAPTER_TIMEOUT_MS),
  "zhihu-knowledge": () => zhihuKnowledgeAdapter(DEFAULT_ADAPTER_TIMEOUT_MS),
  "hot-list": () => hotListAdapter(DEFAULT_ADAPTER_TIMEOUT_MS),
  zhida: () => zhidaAdapter(DEFAULT_ADAPTER_TIMEOUT_MS),
};

// ─── 占位 adapter（尚未实现的来源返回空 + 明确错误，不崩溃整条链） ──

class PlaceholderAdapter implements SourceAdapter {
  readonly source: SourceId;
  private readonly timeoutMs: number;

  constructor(source: SourceId, timeoutMs: number) {
    this.source = source;
    this.timeoutMs = timeoutMs;
  }
  async run(): Promise<AdapterResult> {
    return {
      documents: [],
      errors: [{ source: this.source, message: `${this.source} adapter not implemented` }],
    };
  }
}

function hotListAdapter(timeoutMs: number): SourceAdapter {
  return new PlaceholderAdapter("hot-list", timeoutMs);
}

function zhidaAdapter(timeoutMs: number): SourceAdapter {
  return new PlaceholderAdapter("zhida", timeoutMs);
}

// ─── collectSources 主函数 ─────────────────────────────────────────

export interface CollectSourcesInput {
  query: string;
  queries?: string[];
  sources: SourceId[];
  picked?: SourceDocument[];
  budget?: Partial<HarnessBudget>;
}

export interface CollectResult {
  documents: SourceDocument[];
  errors: Array<{ source: SourceId; message: string }>;
}

/**
 * 按 sources 优先级数组并行收集，单个 adapter 失败隔离，
 * 统一规范化、去重、按预算裁剪文本并过滤空内容。
 */
/**
 * 兼容两种预算传参：扁平 Partial<HarnessBudget> 或 { budget: ... } 包装形式。
 */
function unwrapBudget(
  b?: Partial<HarnessBudget> | { budget?: Partial<HarnessBudget> },
): Partial<HarnessBudget> | undefined {
  if (!b) return undefined;
  if ("budget" in b && b.budget && typeof b.budget === "object") return b.budget;
  return b as Partial<HarnessBudget>;
}

export async function collectSources(
  input: CollectSourcesInput,
  budget?: Partial<HarnessBudget> | { budget?: Partial<HarnessBudget> },
  fetchers?: Fetchers,
  signal?: AbortSignal,
): Promise<CollectResult> {
  // 支持两种传参方式：input.budget 或独立的第二参数（后者优先）
  const effectiveBudget: Partial<HarnessBudget> = {
    ...(input.budget ?? {}),
    ...(unwrapBudget(budget) ?? {}),
  };
  const resolvedBudget = normalizeBudget(effectiveBudget);
  const ctx: AdapterContext = {
    query: input.query,
    queries: input.queries,
    picked: input.picked,
    budget: resolvedBudget,
  };
  const deps = fetchers ?? {};

  const adapters = (input.sources.length > 0 ? input.sources : (["zhihu-search"] as SourceId[]))
    .map((s) => adapterRegistry[s]?.())
    .filter((a): a is SourceAdapter => Boolean(a));

  const results = await Promise.all(
    adapters.map((a) =>
      a.run(ctx, deps, signal).catch((e) => ({
        documents: [] as SourceDocument[],
        errors: [{ source: a.source, message: e instanceof Error ? e.message : String(e) }],
      })),
    ),
  );

  const documents = results.flatMap((r) => r.documents);
  const errors = results.flatMap((r) => r.errors);

  // 去重 → 裁剪文本 → 过滤空内容 → 按 docs 预算上限截断
  let deduped = deduplicateDocuments(documents);
  deduped = deduped
    .map((d) => ({ ...d, text: clampText(d.text, resolvedBudget.charsPerDoc) }))
    .filter((d) => d.text.trim().length > 0);
  deduped = deduped.slice(0, resolvedBudget.docs);

  return { documents: deduped, errors };
}