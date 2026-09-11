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

export async function zhihuSearch(query: string, count = 10) {
  const params = new URLSearchParams({ Query: query, Count: String(Math.min(count, 10)) });
  const res = await fetch(`${BASE}/api/v1/content/zhihu_search?${params}`, { headers: headers() });
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`zhihu_search failed: ${json.Code} ${json.Message}`);
  return (json.Data?.Items ?? []) as SearchResultItem[];
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
