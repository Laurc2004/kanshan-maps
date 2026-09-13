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