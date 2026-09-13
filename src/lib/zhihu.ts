const SECRET = process.env.ZHIHU_ACCESS_SECRET ?? "";
const BASE = "https://developer.zhihu.com";

export type SearchResultItem = {
  Title: string;
  ContentType: string;
  ContentID: string;
  ContentText: string;
  Url: string;
  VoteUpCount: number;
  AuthorName: string;
  AuthorAvatar?: string;
  AuthorSignature?: string;
  AuthorityLevel?: string;
  CommentCount?: number;
  EditTime?: number;
  CommentInfoList?: Array<{ Content: string }>;
  RankingScore?: number;
  AuthorBadge?: string;
  AuthorBadgeText?: string;
};

function headers(oauthToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${SECRET}`,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    "Content-Type": "application/json",
  };
  if (oauthToken) h["X-OAuth-Token"] = oauthToken;
  return h;
}

export async function zhihuSearch(query: string, count = 10, signal?: AbortSignal) {
  const params = new URLSearchParams({
    Query: query,
    Count: String(Math.min(Math.max(count, 1), 10)),
  });
  const res = await fetch(`${BASE}/api/v1/content/zhihu_search?${params}`, { headers: headers(), signal });
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`zhihu_search failed: ${json.Code} ${json.Message}`);
  return (json.Data?.Items ?? []) as SearchResultItem[];
}

/**
 * 全网搜索 API
 * Count max 20; optional Filter (advanced syntax) and SearchDB (all/realtime/static)
 */
export async function globalSearch(
  query: string,
  count = 10,
  filter?: string,
  searchDB?: string,
  signal?: AbortSignal,
): Promise<SearchResultItem[]> {
  const params = new URLSearchParams({
    Query: query,
    Count: String(Math.min(Math.max(count, 1), 20)),
  });
  if (filter) params.set("Filter", filter);
  if (searchDB) params.set("SearchDB", searchDB);

  const res = await fetch(`${BASE}/api/v1/content/global_search?${params}`, { headers: headers(), signal });
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`global_search failed: ${json.Code} ${json.Message}`);
  return (json.Data?.Items ?? []) as SearchResultItem[];
}

export type KnowledgeListItem = {
  work_id: string;
  title: string;
  artwork?: string;
  tab_artwork?: string;
  description?: string;
  labels?: string[];
};

export type KnowledgeDetail = {
  work_id: string;
  chapter_name?: string;
  author_avatar?: string;
  author_name?: string;
  labels?: string[];
  introduction?: string;
  content?: string;
};

/**
 * 知乎知识列表
 * 无需鉴权; 返回 JSON 数组
 */
export async function zhihuKnowledgeList(signal?: AbortSignal): Promise<KnowledgeListItem[]> {
  const res = await fetch("https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/list", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`knowledge list failed: ${res.status}`);
  return (await res.json()) as KnowledgeListItem[];
}

/**
 * 知乎知识详情
 * 验证 work_id 后请求; 无需鉴权
 */
export async function zhihuKnowledgeDetail(workId: string, signal?: AbortSignal): Promise<KnowledgeDetail> {
  // Validate work_id per API doc: reject slash, query, hash, newline
  if (!workId || /[/?#\n\r]/.test(workId)) {
    throw new Error(`Invalid work_id: ${workId}`);
  }
  // Use path encoding to construct safe URL
  const encoded = encodeURIComponent(workId);
  const res = await fetch(`https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/${encoded}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`knowledge detail failed: ${res.status}`);
  return (await res.json()) as KnowledgeDetail;
}

export type ZhidaMessage = { role: string; content: string };

export async function zhida(messages: ZhidaMessage[], model = "zhida-fast-1p5"): Promise<string> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model, messages, stream: false }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`zhida error: ${json.error.message}`);
  return json.choices?.[0]?.message?.content ?? "";
}

export async function hotList(limit = 10) {
  const params = new URLSearchParams({ Limit: String(Math.min(limit, 30)) });
  const res = await fetch(`${BASE}/api/v1/content/hot_list?${params}`, { headers: headers() });
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`hot_list failed: ${json.Code} ${json.Message}`);
  return json.Data?.Items ?? [];
}

export async function userFollowees(oauthToken: string, limit = 50, offset = 0) {
  const params = new URLSearchParams({ Limit: String(limit), Offset: String(offset) });
  const res = await fetch(`${BASE}/api/v1/user/followees?${params}`, { headers: headers(oauthToken) });
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`followees failed: ${json.Code} ${json.Message}`);
  return json.Data?.Items ?? [];
}

// —— 收藏夹（Phase D：收藏夹→学习路线）——
export type FavlistRecord = { UrlToken: number; Url: string; Title: string; Description: string; IsPublic: boolean };
export type CollectionContentItem = {
  ContentType: string; // answer | article | zvideo | pin | question
  Url: string;
  CreatedAt: number;
  FavTime: number;
  LikeCount: number;
  CommentCount: number;
  FavoriteCount: number;
  Title: string;
  Summary: string;
  Author?: { Name: string };
};

export async function userFavlists(oauthToken: string, limit = 50): Promise<FavlistRecord[]> {
  const params = new URLSearchParams({ Limit: String(Math.min(limit, 50)) });
  const res = await fetch(`${BASE}/api/v1/user/favlists?${params}`, { headers: headers(oauthToken) });
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`favlists failed: ${json.Code} ${json.Message}`);
  return json.Data?.Items ?? [];
}

export async function userFavlistContents(oauthToken: string, urlToken: number, limit = 50, offset = 0): Promise<{ items: CollectionContentItem[]; isEnd: boolean }> {
  const params = new URLSearchParams({
    FavlistUrlToken: String(urlToken),
    Limit: String(Math.min(limit, 50)),
    Offset: String(offset),
  });
  const res = await fetch(`${BASE}/api/v1/user/favlist_contents?${params}`, { headers: headers(oauthToken) });
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`favlist_contents failed: ${json.Code} ${json.Message}`);
  return { items: json.Data?.Items ?? [], isEnd: Boolean(json.Data?.Paging?.IsEnd ?? true) };
}

// —— 知乎链接直达（问题 7：粘贴文章/回答链接直接生成总结图）——

/** 识别用户粘贴的知乎内容链接（问题/回答/专栏文章） */
export function isZhihuUrl(text: string): boolean {
  return /^https?:\/\/(www\.zhihu\.com|zhuanlan\.zhihu\.com)\/(question\/\d+(\/answer\/\d+)?|answer\/\d+|p\/\d+)\S*$/i.test(text.trim());
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+\n/g, "\n").trim();
}

/**
 * 从知乎页面 HTML 的 js-initialData 中解析文章/回答为 SearchResultItem。
 * 纯函数：可离线测试。
 */
export function parseZhihuArticleHtml(html: string, url: string): SearchResultItem | null {
  const match = html.match(/<script id="js-initialData" type="text\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const state = (data.initialState ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const entities = state.entities ?? {};
  const articles = entities.articles ?? {};
  const article = Object.values(articles)[0] as
    | { id?: string; title?: string; content?: string; voteupCount?: number; author?: { name?: string } }
    | undefined;
  if (article?.content) {
    return {
      Title: String(article.title ?? "知乎文章"),
      ContentType: "article",
      ContentID: String(article.id ?? url),
      ContentText: stripHtml(String(article.content)).slice(0, 12000),
      Url: url,
      VoteUpCount: Number(article.voteupCount ?? 0),
      AuthorName: String(article.author?.name ?? ""),
    };
  }
  const answers = entities.answers ?? {};
  const answer = Object.values(answers)[0] as
    | { id?: string; content?: string; voteupCount?: number; author?: { name?: string }; question?: { id?: string; title?: string } }
    | undefined;
  if (answer?.content) {
    const questions = entities.questions ?? {};
    const question = answer.question?.id
      ? (questions[answer.question.id] as { title?: string } | undefined)
      : (Object.values(questions)[0] as { title?: string } | undefined);
    return {
      Title: String(question?.title ?? answer.question?.title ?? "知乎回答"),
      ContentType: "answer",
      ContentID: String(answer.id ?? url),
      ContentText: stripHtml(String(answer.content)).slice(0, 12000),
      Url: url,
      VoteUpCount: Number(answer.voteupCount ?? 0),
      AuthorName: String(answer.author?.name ?? ""),
    };
  }
  return null;
}

/** 服务端抓取知乎文章/回答页面并解析为素材（不消耗搜索额度） */
export async function fetchZhihuArticleByUrl(url: string, signal?: AbortSignal): Promise<SearchResultItem> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
    signal,
  });
  if (!res.ok) throw new Error(`知乎返回 ${res.status}，暂时读不了这个链接`);
  const html = (await res.text()).slice(0, 2_000_000);
  const item = parseZhihuArticleHtml(html, url);
  if (!item || !item.ContentText) throw new Error("读不到这篇内容正文（可能是登录可见或不支持的链接类型），可以换成公开的文章/回答链接");
  return item;
}